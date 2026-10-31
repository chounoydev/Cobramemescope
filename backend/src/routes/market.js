import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { getMarket, getMarketCoinDetails } from '../services/marketData.js'
import { getTrendingMemecoinDetails, getTrendingMemecoins, refreshTrackedMemecoins } from '../services/trendingMemecoins.js'
import { getActivePromotions } from '../services/promotions.js'
import { listCommunityTrackedTokens } from '../services/adminChat.js'

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
    if (!details) {
      const promotion = (await getActivePromotions()).find((token) => token.address === address)
      if (!promotion) return response.status(404).json({ error: 'No market pair was found for this token.' })
      return response.json({
        token: { name: promotion.name, symbol: promotion.symbol },
        market: { priceUsd: null, marketCapUsd: null, fdvUsd: null, liquidityUsd: null, volume24hUsd: null, change24h: null, buys24h: null, sells24h: null, pairCreatedAt: promotion.listed_at ? Date.parse(promotion.listed_at) : null, dex: 'Cobra Promotion', pairUrl: '', holderCount: null, holderCountSource: null },
        listings: [],
        chart: { interval, points: [] },
      })
    }
    response.set('Cache-Control', 'no-store')
    response.json(details)
  } catch (error) {
    next(error)
  }
})

router.get('/trending', trendingLimiter, async (request, response, next) => {
  const requestedLimit = Number.parseInt(request.query.limit, 10) || 40
  const limit = Math.min(Math.max(requestedLimit, 1), 100)

  try {
    const result = await getTrendingMemecoins(limit)
    const promoted = await getActivePromotions()
    const promotedCoins = promoted.map((token, index) => ({
      rank: index + 1,
      address: token.address,
      chainId: 'solana',
      chain: 'Solana',
      name: token.name,
      symbol: token.symbol,
      image: token.image,
      pairUrl: '',
      dex: 'Cobra Promotion',
      ageHours: 0,
      priceUsd: null,
      marketCap: null,
      marketCapUsd: null,
      change24h: 0,
      liquidityUsd: 0,
      volume24h: 0,
      buys24h: 0,
      sells24h: 0,
      momentumScore: 0,
      qualityScore: null,
      qualityTier: 'EARLY',
      momentumLabel: 'PROMOTED LISTING',
      promoted: true,
      promotedVerified: true,
      boostAmount: 0.5,
      marketStatus: 'LIVE',
      risk: { level: 'limited', label: 'Limited review', flaggedCount: 0, cautionCount: 0, unknownCount: 1, reasons: ['Promotion does not replace an on-chain security review.'] },
    }))
    const communityTokens = await listCommunityTrackedTokens()
    const communityCoins = communityTokens.map((token) => ({
      rank: 0,
      address: token.address,
      chainId: 'solana',
      chain: 'Solana',
      name: 'Community memecoin',
      symbol: 'COMMUNITY',
      image: '',
      pairUrl: '',
      dex: 'Cobra Community',
      ageHours: 0,
      priceUsd: null,
      marketCap: null,
      marketCapUsd: null,
      change24h: 0,
      liquidityUsd: 0,
      volume24h: 0,
      buys24h: 0,
      sells24h: 0,
      momentumScore: 0,
      qualityScore: null,
      qualityTier: 'COMMUNITY',
      momentumLabel: 'CHAT TRACKED',
      communityTracked: true,
      marketStatus: 'TRACKING',
      risk: { level: 'unknown', label: 'Community detection', flaggedCount: 0, cautionCount: 0, unknownCount: 1, reasons: ['Contract detected from public community chat. Verify the mint address.'] },
    }))
    const coins = [...promotedCoins, ...communityCoins, ...result.coins.filter((coin) => `${coin.chainId}:${coin.address}` !== 'solana:' && !promotedCoins.some((promo) => promo.address === coin.address) && !communityCoins.some((tracked) => tracked.address === coin.address))]
      .slice(0, limit)
      .map((coin, index) => ({ ...coin, rank: index + 1 }))
    response.set('Cache-Control', 'public, max-age=30')
    response.json({
      coins,
      updatedAt: result.updatedAt,
      windowDays: 30,
      refreshSeconds: 30,
      excludedChange24h: -20,
      stale: result.stale,
    })
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
