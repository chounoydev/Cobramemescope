import { Router } from 'express'
import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { query } from '../db.js'
import { ensurePromotionTables, getActivePromotions, isValidPromotionAddress, promotionPrice, verifyPromotionPayment } from '../services/promotions.js'
import { saveLandingEventImage } from '../services/landingContent.js'

const router = Router()
const currencies = new Set(['SOL', 'USDC', 'USDT'])
const promotionImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const promotionImageUpload = express.raw({ type: [...promotionImageTypes], limit: '5mb' })

router.post('/images', requireAuth, promotionImageUpload, async (request, response, next) => {
  const contentType = request.get('Content-Type')?.toLowerCase().split(';')[0] || ''
  if (!promotionImageTypes.has(contentType) || !Buffer.isBuffer(request.body) || request.body.length === 0) {
    return response.status(400).json({ error: 'Choose a JPEG, PNG, WebP, or GIF photo to upload.' })
  }
  try {
    const id = await saveLandingEventImage(contentType, request.body)
    response.status(201).json({ url: `/api/content/event-images/${id}` })
  } catch (error) { next(error) }
})

router.get('/options', async (_request, response, next) => {
  try {
    await ensurePromotionTables()
    const receiver = process.env.PROMOTION_SOLANA_RECEIVER || process.env.DONATION_SOLANA_ADDRESS || 'J4SBuzguguPJh6uU6SiVPX4qfsUDoDbRcEPXa6R8Jbob'
    response.json({ receiver, baseDays: 21, basePriceSol: 0.5, periodDays: 21, maxDays: 365, currencies: [...currencies] })
  } catch (error) { next(error) }
})

router.post('/', requireAuth, async (request, response, next) => {
  try {
    await ensurePromotionTables()
    const name = String(request.body?.name || '').trim().slice(0, 80)
    const symbol = String(request.body?.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
    const mintAddress = String(request.body?.mintAddress || '').trim()
    const imageUrl = String(request.body?.imageUrl || '').trim().slice(0, 500)
    const websiteUrl = String(request.body?.websiteUrl || '').trim().slice(0, 500)
    const socialUrl = String(request.body?.socialUrl || '').trim().slice(0, 500)
    const description = String(request.body?.description || '').trim().slice(0, 500)
    const days = Number(request.body?.days)
    const currency = String(request.body?.currency || '').toUpperCase()
    if (!name || !symbol || !isValidPromotionAddress(mintAddress) || !Number.isInteger(days) || days < 21 || days > 365 || !currencies.has(currency)) {
      return response.status(400).json({ error: 'Enter the token details, mint address, duration, and payment currency.' })
    }
    const priceSol = promotionPrice(days)
    const result = await query(`
      INSERT INTO token_promotions
        (identity_key, name, symbol, chain, mint_address, image_url, website_url, social_url, description, days, price_sol, currency)
      VALUES ($1, $2, $3, 'solana', $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, name, symbol, mint_address, days, price_sol, currency, status, created_at`,
    [request.user.id, name, symbol, mintAddress, imageUrl, websiteUrl, socialUrl, description, days, priceSol, currency])
    response.status(201).json({ promotion: { ...result.rows[0], priceSol: Number(result.rows[0].price_sol) } })
  } catch (error) { next(error) }
})

router.post('/:id/verify-payment', requireAuth, async (request, response, next) => {
  try {
    await ensurePromotionTables()
    const promotionResult = await query('SELECT * FROM token_promotions WHERE id = $1 AND identity_key = $2', [request.params.id, request.user.id])
    const promotion = promotionResult.rows[0]
    if (!promotion) return response.status(404).json({ error: 'Promotion not found.' })
    if (promotion.status === 'listed') return response.json({ promotion, listed: true })
    const signature = String(request.body?.signature || '').trim()
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature)) {
      return response.status(400).json({ error: 'Enter the Solana transaction signature.' })
    }
    const used = await query('SELECT id FROM token_promotions WHERE payment_signature = $1 AND id <> $2', [signature, promotion.id])
    if (used.rows.length) return response.status(409).json({ error: 'This transaction is already used by another promotion.' })
    const paid = await verifyPromotionPayment({ signature, currency: promotion.currency, expectedSol: Number(promotion.price_sol) })
    if (!paid) return response.status(402).json({ error: 'Payment was not confirmed to the Cobra MemeScope treasury address.' })
    const expiresAt = new Date(Date.now() + Number(promotion.days) * 24 * 60 * 60 * 1000)
    await query(`
      UPDATE token_promotions
      SET payment_signature = $1, status = 'listed', listed_at = NOW(), expires_at = $2, updated_at = NOW()
      WHERE id = $3`,
    [signature, expiresAt, promotion.id])
    response.json({ listed: true, expiresAt })
  } catch (error) { next(error) }
})

router.get('/mine', requireAuth, async (request, response, next) => {
  try {
    await ensurePromotionTables()
    const result = await query('SELECT * FROM token_promotions WHERE identity_key = $1 ORDER BY created_at DESC', [request.user.id])
    response.json({ promotions: result.rows })
  } catch (error) { next(error) }
})

router.get('/active', async (_request, response, next) => {
  try {
    response.json({ promotions: await getActivePromotions() })
  } catch (error) { next(error) }
})

export default router
