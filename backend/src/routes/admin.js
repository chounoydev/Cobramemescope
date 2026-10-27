import { Router } from 'express'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import bs58 from 'bs58'
import { requireAdminWalletAuth, requireOwnerOrStaffWalletAuth, requireOwnerWalletAuth } from '../middleware/auth.js'
import { getDonorDashboard } from '../services/donorActivity.js'
import { addStaffWallet, deleteLandingEvent, deleteStaffWallet, listLandingEvents, listStaffWallets, saveLandingEvent, saveLandingEventImage } from '../services/landingContent.js'
import { saveSeasonalTheme, seasonalThemes } from '../services/siteTheme.js'

const router = Router()
const dashboardLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false })
const eventImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const eventImageUpload = express.raw({ type: [...eventImageTypes], limit: '5mb' })

function hasValidImageSignature(contentType, image) {
  if (!Buffer.isBuffer(image)) return false
  if (contentType === 'image/jpeg') return image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
  if (contentType === 'image/png') return image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (contentType === 'image/webp') return image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'
  if (contentType === 'image/gif') return image.toString('ascii', 0, 3) === 'GIF'
  return false
}

router.get('/donors', dashboardLimiter, requireAdminWalletAuth, async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'private, no-store')
    response.json(await getDonorDashboard())
  } catch (error) {
    next(error)
  }
})

function normalizeLandingEvent(input) {
  const event = {
    badge: String(input?.badge || '').trim(),
    title: String(input?.title || '').trim(),
    description: String(input?.description || '').trim(),
    eventDate: String(input?.eventDate || '').trim(),
    cta: String(input?.cta || '').trim(),
    imageUrl: String(input?.imageUrl || '').trim(),
  }
  if (!event.badge || event.badge.length > 60) throw new Error('Enter a badge (up to 60 characters).')
  if (!event.title || event.title.length > 140) throw new Error('Enter a title (up to 140 characters).')
  if (!event.description || event.description.length > 1000) throw new Error('Enter a description (up to 1,000 characters).')
  if (event.eventDate.length > 100) throw new Error('Event date must be 100 characters or fewer.')
  if (!event.cta || event.cta.length > 80) throw new Error('Enter button text (up to 80 characters).')
  if (event.imageUrl) {
    let imageUrl
    try { imageUrl = new URL(event.imageUrl) } catch { throw new Error('Image URL must be a valid HTTPS link.') }
    const isLocalDevelopmentUrl = imageUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(imageUrl.hostname)
    if (imageUrl.protocol !== 'https:' && !isLocalDevelopmentUrl) throw new Error('Image URL must use HTTPS.')
  }
  return event
}

function isSolanaWalletAddress(address) {
  try {
    const bytes = bs58.decode(address)
    return bytes.length === 32 && bs58.encode(bytes) === address
  } catch {
    return false
  }
}

router.get('/access', requireOwnerOrStaffWalletAuth, (request, response) => {
  response.set('Cache-Control', 'private, no-store')
  response.json({ role: request.user.role, walletAddress: request.user.walletAddress })
})

router.put('/theme', requireOwnerWalletAuth, async (request, response, next) => {
  const theme = request.body?.theme
  if (!seasonalThemes.includes(theme)) {
    return response.status(400).json({ error: 'Choose a supported seasonal theme.' })
  }
  try {
    response.set('Cache-Control', 'no-store')
    response.json(await saveSeasonalTheme(theme))
  } catch (error) {
    next(error)
  }
})

router.get('/events', requireOwnerOrStaffWalletAuth, async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'private, no-store')
    response.json({ events: await listLandingEvents() })
  } catch (error) { next(error) }
})

router.post('/event-images', requireOwnerOrStaffWalletAuth, eventImageUpload, async (request, response, next) => {
  const contentType = request.get('Content-Type')?.toLowerCase()
  if (!eventImageTypes.has(contentType) || !hasValidImageSignature(contentType, request.body)) {
    return response.status(400).json({ error: 'Choose a valid JPEG, PNG, WebP, or GIF image to upload.' })
  }
  try {
    const id = await saveLandingEventImage(contentType, request.body)
    response.status(201).json({ id })
  } catch (error) {
    next(error)
  }
})

router.post('/events', requireOwnerOrStaffWalletAuth, async (request, response, next) => {
  try {
    response.status(201).json(await saveLandingEvent(normalizeLandingEvent(request.body)))
  } catch (error) {
    if (error instanceof Error && !error.code) return response.status(400).json({ error: error.message })
    next(error)
  }
})

router.put('/events/:id', requireOwnerOrStaffWalletAuth, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.id)) return response.status(400).json({ error: 'Invalid event id.' })
  try {
    const event = await saveLandingEvent(normalizeLandingEvent(request.body), request.params.id)
    if (!event) return response.status(404).json({ error: 'Event not found.' })
    response.json(event)
  } catch (error) {
    if (error instanceof Error && !error.code) return response.status(400).json({ error: error.message })
    next(error)
  }
})

router.delete('/events/:id', requireOwnerOrStaffWalletAuth, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.id)) return response.status(400).json({ error: 'Invalid event id.' })
  try {
    if (!await deleteLandingEvent(request.params.id)) return response.status(404).json({ error: 'Event not found.' })
    response.status(204).end()
  } catch (error) { next(error) }
})

router.get('/staff', requireOwnerWalletAuth, async (_request, response, next) => {
  try { response.json({ staff: await listStaffWallets() }) } catch (error) { next(error) }
})

router.post('/staff', requireOwnerWalletAuth, async (request, response, next) => {
  const walletAddress = String(request.body?.walletAddress || '').trim()
  if (!isSolanaWalletAddress(walletAddress)) return response.status(400).json({ error: 'Enter a valid Solana wallet address.' })
  if (walletAddress === request.user.walletAddress) return response.status(409).json({ error: 'The developer wallet already has owner access.' })
  try {
    const staff = await addStaffWallet(walletAddress, request.user.walletAddress)
    if (!staff) return response.status(409).json({ error: 'That wallet already has staff access.' })
    response.status(201).json(staff)
  } catch (error) { next(error) }
})

router.delete('/staff/:walletAddress', requireOwnerWalletAuth, async (request, response, next) => {
  const walletAddress = String(request.params.walletAddress || '').trim()
  if (!isSolanaWalletAddress(walletAddress)) return response.status(400).json({ error: 'Invalid Solana wallet address.' })
  try {
    if (!await deleteStaffWallet(walletAddress)) return response.status(404).json({ error: 'Staff wallet not found.' })
    response.status(204).end()
  } catch (error) { next(error) }
})

export default router