import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { recordSiteActivity } from '../services/loginStats.js'
import { isAllowedFrontendOrigin } from '../utils/frontendOrigins.js'

const router = Router()
const activityLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false })
const eventTypes = new Set(['site_visit', 'wallet_connect', 'contract_scan', 'token_track'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isWalletAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

router.post('/activity', activityLimiter, async (request, response, next) => {
  const origin = request.get('origin')
  const visitorId = String(request.body?.visitorId || '')
  const eventType = String(request.body?.eventType || '')
  const walletAddress = request.body?.walletAddress ? String(request.body.walletAddress).trim() : null

  if (!origin || !isAllowedFrontendOrigin(origin)) return response.status(403).json({ error: 'Activity tracking is not allowed from this origin.' })
  if (!uuidPattern.test(visitorId) || !eventTypes.has(eventType)) return response.status(400).json({ error: 'Invalid activity event.' })
  if (walletAddress && (eventType !== 'wallet_connect' || !isWalletAddress(walletAddress))) {
    return response.status(400).json({ error: 'Invalid wallet connection event.' })
  }

  try {
    await recordSiteActivity({ visitorId, eventType, walletAddress })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

export default router