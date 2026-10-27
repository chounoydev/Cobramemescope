import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { getMarket, getMarketCoinDetails } from '../services/marketData.js'
import { getTrendingMemecoinDetails, getTrendingMemecoins, refreshTrackedMemecoins } from '../services/trendingMemecoins.js'

const router = Router()
const trendingLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false })
const detailsLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false })
const coinDetailsLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false })
const watchlistMarketLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false })

router.post('/trending/watchlist', watchlistMarketLimiter, async (request, response, next) => {
  try {
    const updates = await refreshTrackedMemecoins(request.body?.tokens)
    response.set('Cache-Control', 'no-store')
    response.json({ updates, updatedAt: new Date().toISOString() })
  } catch (error) {
    next(error)
  }
})

router.get('/trending/:chainId/:address', detailsLimiter, async (request, response, next) => {
  const chainId = String(request.params.chainId || '').toLowerCase()
  const address = String(request.params.address || '').trim()
  const interval = String(request.query.interval || '1h')
  const allowedIntervals = new Set(['1m', '5m', '1h', '2h', '3h', '5h', '8h', '1d', '1mo'])
  const validSuiAddress = chainId === 'sui' && /^0x[0-9a-f]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*$/i.test(address)
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(chainId)
    || (chainId === 'sui' ? !validSuiAddress : !address || address.length > 64)) {
    return response.status(400).json({ error: 'Invalid chain or token address.' })
  }
  if (!allowedIntervals.has(interval)) return response.status(400).json({ error: 'Invalid chart interval.' })

  try {
    const details = await getTrendingMemecoinDetails(chainId, address, interval)
    if (!details) return response.status(404).json({ error: 'No market pair was found for this token.' })
    response.set('Cache-Control', 'no-store')
    response.json(details)
  } catch (error) {
    next(error)
  }
})

router.get('/trending', trendingLimiter, async (request, response, next) => {
  const requestedLimit = Number.parseInt(request.query.limit, 10) || 40
  const limit = Math.min(Math.max(requestedLimit, 1), 50)

  try {
    const coins = await getTrendingMemecoins(limit)
    response.set('Cache-Control', 'public, max-age=30')
    response.json({ coins, updatedAt: new Date().toISOString(), windowDays: 30, refreshSeconds: 60, excludedChange24h: -20 })
  } catch (error) {
    next(error)
  }
})

router.get('/coin/:id', coinDetailsLimiter, async (request, response, next) => {
  const id = String(request.params.id || '')
  const days = Number(request.query.days || 1)
  if (!/^[a-z0-9-]{1,40}$/.test(id) || ![1, 7, 30, 90].includes(days)) {
    return response.status(400).json({ error: 'Invalid coin or chart range.' })
  }

  try {
    const details = await getMarketCoinDetails(id, days)
    if (!details) return response.status(404).json({ error: 'Market details are not available for this coin.' })
    response.set('Cache-Control', 'public, max-age=30')
    response.json(details)
  } catch (error) {
    next(error)
  }
})

router.get('/', async (request, response, next) => {
  const requestedLimit = Number.parseInt(request.query.limit, 10) || 50
  const limit = Math.min(Math.max(requestedLimit, 1), 50)

  try {
    const coins = await getMarket(limit)
    response.set('Cache-Control', 'public, max-age=30')
    response.json({ coins, updatedAt: new Date().toISOString() })
  } catch (error) {
    next(error)
  }
})

export default router
