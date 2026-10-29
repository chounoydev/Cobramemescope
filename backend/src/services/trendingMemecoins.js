import { scanContract } from './contractScanner.js'

const profilesUrl = 'https://api.dexscreener.com/token-profiles/latest/v1'
const pairsUrl = 'https://api.dexscreener.com/tokens/v1/'
const chainNames = {
  solana: 'Solana',
  ethereum: 'Ethereum',
  base: 'Base',
  bsc: 'BNB Chain',
  arbitrum: 'Arbitrum',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  sui: 'Sui',
  cronos: 'Cronos',
  linea: 'Linea',
  mantle: 'Mantle',
  zksync: 'zkSync',
  celo: 'Celo',
  gnosis: 'Gnosis',
  moonbeam: 'Moonbeam',
  sonic: 'Sonic',
  robinhood: 'Robinhood',
}
const geckoTerminalNetworks = {
  solana: 'solana',
  ethereum: 'eth',
  base: 'base',
  bsc: 'bsc',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
  avalanche: 'avax',
  sui: 'sui-network',
  cronos: 'cronos',
  linea: 'linea',
  mantle: 'mantle',
  zksync: 'zksync',
  celo: 'celo',
  gnosis: 'xdai',
  moonbeam: 'moonbeam',
  sonic: 'sonic',
}
const maxTrendingCoins = 50
const newPoolMaxAgeMs = 30 * 24 * 60 * 60 * 1000
const minimumLiquidityUsd = 5_000
const minimumVolume24hUsd = 1_000
const dumpThreshold24h = -20
const cacheTtlMs = 60_000
const staleCacheTtlMs = 10 * 60_000
const geckoDiscoveryCacheTtlMs = 5 * 60_000
const chartCacheTtlMs = 20_000
const chartPointsCache = new Map()
const geckoDiscoveryCache = new Map()
const geckoDiscoveryPending = new Map()
const geckoDiscoveryChains = ['solana', 'ethereum', 'base', 'bsc', 'arbitrum', 'polygon', 'avalanche', 'sui']
const commonQuoteSymbols = new Set([
  'AVAX', 'BNB', 'BTC', 'DAI', 'ETH', 'MATIC', 'POL', 'SOL', 'SUI', 'USDC', 'USDT',
  'WAVAX', 'WBTC', 'WBNB', 'WETH', 'WMATIC', 'WSOL', 'WSUI',
])

let cachedCoins = null
let cachedAt = 0
let pendingUpdate = null
const chartDataCache = new Map()

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isValidSuiTokenAddress(address) {
  return /^0x[0-9a-f]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*$/i.test(address)
}

function fallbackTokenImage(address, symbol) {
  let hash = 0
  for (const character of address) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  const hue = hash % 360
  const mark = String(symbol || '?').replace(/[&<>"']/g, '').slice(0, 2) || '?'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="hsl(${hue},62%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 58) % 360},66%,22%)"/></linearGradient></defs><circle cx="32" cy="32" r="31" fill="url(#g)"/><circle cx="32" cy="32" r="25" fill="none" stroke="white" stroke-opacity=".22" stroke-width="2"/><text x="32" y="38" fill="white" font-family="Arial,sans-serif" font-size="20" font-weight="700" text-anchor="middle">${mark}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function momentumScore(liquidity, volume, change, buys, sells) {
  const boundedChange = Math.max(0, Math.min(300, change || 0))
  const trades = (buys || 0) + (sells || 0)
  return boundedChange * 0.6
    + Math.log10(volume + 1) * 8
    + Math.log10(liquidity + 1) * 5
    + Math.log10(trades + 1) * 7
}

function growthLabel(change, buys, sells, ageHours) {
  if (change !== null && change >= 20) return 'FAST GROWER'
  if ((buys || 0) + (sells || 0) >= 150) return 'HIGH ACTIVITY'
  if (ageHours <= 24) return 'JUST LAUNCHED'
  return 'FRESH PAIR'
}

function candidateFromPair(profile, pair) {
  const address = String(profile.tokenAddress || '')
  const token = [pair.baseToken, pair.quoteToken].find((item) => item?.address?.toLowerCase() === address.toLowerCase())
  if (!token) return null

  const createdAt = numberOrNull(pair.pairCreatedAt)
  const liquidity = numberOrNull(pair.liquidity?.usd)
  const volume = numberOrNull(pair.volume?.h24)
  const change = numberOrNull(pair.priceChange?.h24)
  const buys = numberOrNull(pair.txns?.h24?.buys)
  const sells = numberOrNull(pair.txns?.h24?.sells)
  if (createdAt === null || liquidity === null || volume === null || change === null) return null

  const createdAtMs = createdAt < 1_000_000_000_000 ? createdAt * 1000 : createdAt
  const ageMs = Date.now() - createdAtMs
  if (ageMs < 0 || ageMs > newPoolMaxAgeMs) return null
  if (change <= dumpThreshold24h || liquidity < minimumLiquidityUsd || volume < minimumVolume24hUsd) return null

  const ageHours = ageMs / 3_600_000
  const score = momentumScore(liquidity, volume, change, buys, sells)
  return {
    address,
    chainId: pair.chainId,
    chain: chainNames[pair.chainId] || pair.chainId,
    name: token.name || profile.name || 'Unknown token',
    symbol: String(token.symbol || profile.symbol || '—').toUpperCase(),
    image: pair.info?.imageUrl || profile.icon || fallbackTokenImage(address, token.symbol || profile.symbol),
    pairUrl: pair.url || profile.url || '',
    dex: pair.dexId || 'DEX',
    ageHours: Math.round(ageHours),
    priceUsd: numberOrNull(pair.priceUsd),
    marketCapUsd: numberOrNull(pair.marketCap),
    change24h: change,
    liquidityUsd: liquidity,
    volume24h: volume,
    buys24h: buys || 0,
    sells24h: sells || 0,
    momentumScore: Math.round(score * 10) / 10,
    momentumLabel: growthLabel(change, buys, sells, ageHours),
    promoted: Boolean(profile.promoted),
    boostAmount: numberOrNull(profile.totalAmount ?? profile.amount) || 0,
    marketStatus: 'LIVE',
    _pair: pair,
  }
}

function summarizeRisk(report) {
  const { flaggedCount, cautionCount, unknownCount } = report.summary
  const level = flaggedCount ? 'danger' : cautionCount ? 'caution' : unknownCount ? 'limited' : 'clear'
  const labels = report.checks
    .filter((check) => check.status === 'danger' || check.status === 'caution')
    .slice(0, 2)
    .map((check) => check.label)

  return {
    level,
    label: level === 'danger' ? 'HIGH RISK' : level === 'caution' ? 'CAUTION' : level === 'limited' ? 'UNVERIFIED' : 'REVIEW CLEAR',
    flaggedCount,
    cautionCount,
    unknownCount,
    reasons: labels,
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Market provider returned ${response.status}.`)
  return response.json()
}

async function fetchGeckoDiscoveryProfiles(chainId) {
  const network = geckoTerminalNetworks[chainId]
  if (!network) return []
  const cached = geckoDiscoveryCache.get(chainId)
  if (cached && cached.expiresAt > Date.now()) return cached.profiles
  const pending = geckoDiscoveryPending.get(chainId)
  if (pending) return pending

  const request = (async () => {
    let profiles = []
    try {
      const discovered = new Map()
      for (const page of [1, 2]) {
        try {
          const url = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/new_pools?page=${page}&include=base_token,quote_token`
          const result = await fetchJson(url)
          const tokens = new Map((Array.isArray(result.included) ? result.included : [])
            .filter((item) => item?.type === 'token' && item.id && item.attributes)
            .map((item) => [item.id, item.attributes]))
          for (const pool of Array.isArray(result.data) ? result.data : []) {
            const relationships = pool.relationships || {}
            for (const side of ['base_token', 'quote_token']) {
              const tokenId = relationships[side]?.data?.id
              const token = tokens.get(tokenId)
              const address = String(token?.address || '')
              const symbol = String(token?.symbol || '').trim().toUpperCase()
              if (!address || commonQuoteSymbols.has(symbol)) continue
              discovered.set(address.toLowerCase(), {
                chainId,
                tokenAddress: address,
                name: token.name || 'Unknown token',
                symbol: token.symbol || '—',
                icon: token.image_url || '',
                promoted: false,
              })
            }
          }
        } catch {
          if (page === 1) throw new Error(`GeckoTerminal discovery unavailable for ${chainId}.`)
        }
      }
      profiles = [...discovered.values()]
    } catch {
      profiles = []
    }
    geckoDiscoveryCache.set(chainId, {
      profiles,
      expiresAt: Date.now() + (profiles.length ? geckoDiscoveryCacheTtlMs : 60_000),
    })
    return profiles
  })()
  geckoDiscoveryPending.set(chainId, request)
  try {
    return await request
  } finally {
    geckoDiscoveryPending.delete(chainId)
  }
}

async function getGeckoDiscoveryProfiles() {
  const profiles = []
  for (let offset = 0; offset < geckoDiscoveryChains.length; offset += 2) {
    const batch = geckoDiscoveryChains.slice(offset, offset + 2)
    const results = await Promise.allSettled(batch.map((chainId) => fetchGeckoDiscoveryProfiles(chainId)))
    for (const result of results) {
      if (result.status === 'fulfilled') profiles.push(...result.value)
    }
  }
  return profiles
}

function interleaveCandidatesByChain(candidates) {
  const groups = new Map()
  for (const candidate of candidates) {
    if (!groups.has(candidate.chainId)) groups.set(candidate.chainId, [])
    groups.get(candidate.chainId).push(candidate)
  }
  const queues = [...groups.values()]
  for (const queue of queues) {
    queue.sort((left, right) => Number(right.promoted) - Number(left.promoted) || right.momentumScore - left.momentumScore)
  }

  const ordered = []
  while (queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const candidate = queue.shift()
      if (candidate) ordered.push(candidate)
    }
  }
  return ordered
}

async function updateTrendingCoins(limit) {
  const feeds = [
    { url: profilesUrl, promoted: false },
    { url: 'https://api.dexscreener.com/token-profiles/recent-updates/v1', promoted: false },
    { url: 'https://api.dexscreener.com/token-boosts/latest/v1', promoted: true },
    { url: 'https://api.dexscreener.com/token-boosts/top/v1', promoted: true },
  ]
  const profileResponses = await Promise.allSettled(feeds.map((feed) => fetchJson(feed.url)))
  const uniqueProfiles = new Map()
  profileResponses.forEach((result, index) => {
    if (result.status !== 'fulfilled' || !Array.isArray(result.value)) return
    for (const profile of result.value) {
      const chainId = String(profile.chainId || '').toLowerCase()
      const tokenAddress = String(profile.tokenAddress || '').trim()
      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(chainId) || chainId === 'optimism' || !tokenAddress) continue
      const key = `${chainId}:${tokenAddress.toLowerCase()}`
      const existing = uniqueProfiles.get(key)
      uniqueProfiles.set(key, {
        ...(existing || {}),
        ...profile,
        chainId,
        tokenAddress,
        name: profile.name || existing?.name,
        symbol: profile.symbol || existing?.symbol,
        icon: profile.icon || existing?.icon || '',
        promoted: Boolean(existing?.promoted || feeds[index].promoted),
        totalAmount: Math.max(Number(existing?.totalAmount) || 0, Number(profile.totalAmount) || 0),
      })
    }
  })
  for (const profile of await getGeckoDiscoveryProfiles()) {
    const key = `${profile.chainId}:${profile.tokenAddress.toLowerCase()}`
    const existing = uniqueProfiles.get(key)
    uniqueProfiles.set(key, {
      ...(existing || {}),
      ...profile,
      name: profile.name || existing?.name,
      symbol: profile.symbol || existing?.symbol,
      icon: profile.icon || existing?.icon || '',
      promoted: Boolean(existing?.promoted),
      totalAmount: Number(existing?.totalAmount) || 0,
    })
  }
  const profiles = [...uniqueProfiles.values()]
  if (profiles.length === 0) throw new Error('Token discovery providers are unavailable.')

  const groups = new Map()
  for (const profile of profiles) {
    const chainId = profile.chainId
    const address = profile.tokenAddress
    if (!groups.has(chainId)) groups.set(chainId, [])
    groups.get(chainId).push(profile)
  }

  const pairJobs = []
  for (const [chainId, chainProfiles] of groups) {
    for (let offset = 0; offset < chainProfiles.length; offset += 30) {
      const chunk = chainProfiles.slice(offset, offset + 30)
      pairJobs.push((async () => {
        const addresses = chunk.map((profile) => encodeURIComponent(profile.tokenAddress)).join(',')
        try {
          const result = await fetchJson(`${pairsUrl}${encodeURIComponent(chainId)}/${addresses}`)
          return { chainId, profiles: chunk, pairs: Array.isArray(result) ? result : [] }
        } catch {
          return { chainId, profiles: chunk, pairs: [] }
        }
      })())
    }
  }

  const pairResults = await Promise.all(pairJobs)
  const candidatesByToken = new Map()
  for (const { chainId, profiles: chainProfiles, pairs } of pairResults) {
    for (const profile of chainProfiles) {
      const profileAddress = profile.tokenAddress.toLowerCase()
      const tokenPairs = pairs.filter((pair) => pair.chainId === chainId
        && [pair.baseToken?.address, pair.quoteToken?.address].some((address) => address?.toLowerCase() === profileAddress))
      tokenPairs.sort((left, right) => (numberOrNull(right.liquidity?.usd) || 0) - (numberOrNull(left.liquidity?.usd) || 0))
      const candidate = tokenPairs.map((pair) => candidateFromPair(profile, pair)).find(Boolean)
      if (!candidate) continue
      const key = `${chainId}:${profileAddress}`
      const existing = candidatesByToken.get(key)
      if (!existing || candidate.momentumScore > existing.momentumScore) candidatesByToken.set(key, candidate)
    }
  }

  const candidates = interleaveCandidatesByChain([...candidatesByToken.values()])
  const reviewed = []
  const scanLimit = Math.min(candidates.length, limit * 4)
  const scanBatchSize = 8
  for (let offset = 0; offset < scanLimit && reviewed.length < limit; offset += scanBatchSize) {
    const batch = candidates.slice(offset, Math.min(offset + scanBatchSize, scanLimit))
    const results = await Promise.all(batch.map(async (candidate) => {
      if (candidate.chainId === 'sui') {
        return {
          ...candidate,
          risk: { level: 'limited', label: 'UNVERIFIED', flaggedCount: 0, cautionCount: 0, unknownCount: 1, reasons: ['Sui market activity is screened, but contract risk checks are not available.'] },
        }
      }
      try {
        const review = await scanContract(candidate.address, { marketPairs: [candidate._pair] })
        return { ...candidate, risk: summarizeRisk(review) }
      } catch {
        return {
          ...candidate,
          risk: { level: 'limited', label: 'UNVERIFIED', flaggedCount: 0, cautionCount: 0, unknownCount: 1, reasons: ['Contract risk source unavailable for this chain.'] },
        }
      }
    }))
    reviewed.push(...results.filter((candidate) => candidate.risk.level !== 'danger'))
  }

  const coins = reviewed.slice(0, limit).map(({ _pair, ...coin }, index) => ({ ...coin, rank: index + 1 }))
  cachedCoins = coins
  cachedAt = Date.now()
  return coins
}

export async function refreshTrackedMemecoins(input) {
  if (!Array.isArray(input)) return []
  const requested = [...new Map(input.slice(0, 50)
    .filter((item) => item && /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(item.chainId || '').toLowerCase())
      && typeof item.address === 'string'
      && (String(item.chainId).toLowerCase() === 'sui' ? isValidSuiTokenAddress(item.address) : item.address.length > 0 && item.address.length <= 64))
    .map((item) => {
      const chainId = String(item.chainId).toLowerCase()
      const address = item.address.trim()
      return [`${chainId}:${address.toLowerCase()}`, { chainId, address }]
    })).values()]
  if (requested.length === 0) return []

  const groups = new Map()
  for (const token of requested) {
    if (!groups.has(token.chainId)) groups.set(token.chainId, [])
    groups.get(token.chainId).push(token)
  }

  const pairJobs = []
  for (const [chainId, tokens] of groups) {
    for (let offset = 0; offset < tokens.length; offset += 30) {
      const chunk = tokens.slice(offset, offset + 30)
      pairJobs.push((async () => {
        const addresses = chunk.map((token) => encodeURIComponent(token.address)).join(',')
        try {
          const response = await fetchJson(`${pairsUrl}${encodeURIComponent(chainId)}/${addresses}`)
          return { chainId, tokens: chunk, pairs: Array.isArray(response) ? response : [] }
        } catch {
          return { chainId, tokens: chunk, pairs: [] }
        }
      })())
    }
  }

  const pairResults = await Promise.all(pairJobs)
  const marketByAddress = new Map()
  for (const { chainId, tokens, pairs } of pairResults) {
    for (const token of tokens) {
      const tokenAddress = token.address.toLowerCase()
      const matches = pairs.filter((pair) => pair.chainId === chainId
        && [pair.baseToken?.address, pair.quoteToken?.address].some((address) => address?.toLowerCase() === tokenAddress))
      matches.sort((left, right) => (numberOrNull(right.liquidity?.usd) || 0) - (numberOrNull(left.liquidity?.usd) || 0))
      const pair = matches[0]
      if (!pair) continue

      const change24h = numberOrNull(pair.priceChange?.h24)
      const liquidityUsd = numberOrNull(pair.liquidity?.usd)
      const volume24h = numberOrNull(pair.volume?.h24)
      const buys24h = numberOrNull(pair.txns?.h24?.buys) || 0
      const sells24h = numberOrNull(pair.txns?.h24?.sells) || 0
      marketByAddress.set(`${chainId}:${tokenAddress}`, {
        priceUsd: numberOrNull(pair.priceUsd),
        change24h,
        liquidityUsd,
        volume24h,
        buys24h,
        sells24h,
        pairUrl: pair.url || '',
        dex: pair.dexId || 'DEX',
        marketStatus: change24h !== null && change24h <= dumpThreshold24h ? 'BEARISH' : liquidityUsd !== null && liquidityUsd < minimumLiquidityUsd ? 'THIN LIQUIDITY' : 'LIVE',
        marketUpdatedAt: new Date().toISOString(),
      })
    }
  }

  return requested.map((token) => ({
    chainId: token.chainId,
    address: token.address,
    ...(marketByAddress.get(`${token.chainId}:${token.address.toLowerCase()}`) || { marketStatus: 'UNAVAILABLE' }),
  }))
}

function aggregateCandles(points, intervalSeconds, calendarMonth = false) {
  const candles = new Map()
  for (const point of points) {
    const date = new Date(point.timestamp)
    const bucket = calendarMonth
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
      : Math.floor(point.timestamp / (intervalSeconds * 1000)) * intervalSeconds * 1000
    const candle = candles.get(bucket)
    if (candle) {
      candle.high = Math.max(candle.high, point.high)
      candle.low = Math.min(candle.low, point.low)
      candle.close = point.close
      candle.priceUsd = point.close
      candle.volumeUsd += point.volumeUsd
    } else {
      candles.set(bucket, { ...point, timestamp: bucket })
    }
  }
  return [...candles.values()].sort((left, right) => left.timestamp - right.timestamp)
}

const chartIntervals = {
  '1m': { timeframe: 'minute', baseSeconds: 60, intervalSeconds: 60, baseLimit: 300, displayLimit: 60 },
  '5m': { timeframe: 'minute', baseSeconds: 60, intervalSeconds: 300, baseLimit: 300, displayLimit: 60 },
  '1h': { timeframe: 'hour', baseSeconds: 3600, intervalSeconds: 3600, baseLimit: 192, displayLimit: 192 },
  '2h': { timeframe: 'hour', baseSeconds: 3600, intervalSeconds: 7200, baseLimit: 192, displayLimit: 96 },
  '3h': { timeframe: 'hour', baseSeconds: 3600, intervalSeconds: 10800, baseLimit: 192, displayLimit: 64 },
  '5h': { timeframe: 'hour', baseSeconds: 3600, intervalSeconds: 18000, baseLimit: 192, displayLimit: 39 },
  '8h': { timeframe: 'hour', baseSeconds: 3600, intervalSeconds: 28800, baseLimit: 192, displayLimit: 24 },
  '1d': { timeframe: 'day', baseSeconds: 86400, intervalSeconds: 86400, baseLimit: 370, displayLimit: 370 },
  '1mo': { timeframe: 'day', baseSeconds: 86400, intervalSeconds: 2592000, baseLimit: 370, displayLimit: 12, calendarMonth: true },
}

export async function getTrendingMemecoinDetails(chainId, address, interval = '1h') {
  const pairs = await fetchJson(`${pairsUrl}${encodeURIComponent(chainId)}/${encodeURIComponent(address)}`)
  const tokenAddress = address.toLowerCase()
  const matchingPairs = (Array.isArray(pairs) ? pairs : []).filter((pair) => pair.chainId === chainId
    && [pair.baseToken?.address, pair.quoteToken?.address].some((candidate) => candidate?.toLowerCase() === tokenAddress))
  matchingPairs.sort((left, right) => (numberOrNull(right.liquidity?.usd) || 0) - (numberOrNull(left.liquidity?.usd) || 0))
  const pair = matchingPairs[0]
  if (!pair) return null

  let chartPoints = []
  const network = geckoTerminalNetworks[chainId]
  const poolAddress = String(pair.pairAddress || '')
  const chartConfig = chartIntervals[interval] || chartIntervals['1h']
  if (network && poolAddress) {
    const tokenSide = pair.baseToken?.address?.toLowerCase() === tokenAddress ? 'base' : 'quote'
    const chartUrl = new URL(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${chartConfig.timeframe}`)
    chartUrl.searchParams.set('aggregate', '1')
    chartUrl.searchParams.set('limit', String(chartConfig.baseLimit))
    chartUrl.searchParams.set('currency', 'usd')
    chartUrl.searchParams.set('token', tokenSide)
    const cacheKey = `${chainId}:${poolAddress}:${tokenSide}:${chartConfig.timeframe}`
    let baseChartPoints = chartPointsCache.get(cacheKey) || []
    try {
      let cached = chartDataCache.get(cacheKey)
      if (!cached || cached.expiresAt <= Date.now()) {
        const promise = fetchJson(chartUrl.toString())
        cached = { expiresAt: Date.now() + chartCacheTtlMs, promise }
        chartDataCache.set(cacheKey, cached)
      }
      let chart
      try {
        chart = await cached.promise
      } catch (error) {
        chartDataCache.delete(cacheKey)
        throw error
      }
      const rows = chart.data?.attributes?.ohlcv_list
      const fetchedPoints = Array.isArray(rows)
        ? rows.filter((row) => Array.isArray(row) && row.length >= 5
          && row.slice(0, 5).every((value) => Number.isFinite(Number(value)))
          && Number(row[4]) > 0)
          .map((row) => ({
            timestamp: Number(row[0]) * 1000,
            open: Number(row[1]),
            high: Number(row[2]),
            low: Number(row[3]),
            close: Number(row[4]),
            priceUsd: Number(row[4]),
            volumeUsd: numberOrNull(row[5]) || 0,
          }))
          .sort((left, right) => left.timestamp - right.timestamp)
        : []
      if (fetchedPoints.length > 0) {
        baseChartPoints = fetchedPoints
        if (!chartPointsCache.has(cacheKey) && chartPointsCache.size >= 250) {
          const oldestKey = chartPointsCache.keys().next().value
          if (oldestKey) chartPointsCache.delete(oldestKey)
        }
        chartPointsCache.set(cacheKey, fetchedPoints)
      }
    } catch {
      baseChartPoints = chartPointsCache.get(cacheKey) || []
    }
    chartPoints = baseChartPoints
    if (chartConfig.intervalSeconds !== chartConfig.baseSeconds || chartConfig.calendarMonth) {
      chartPoints = aggregateCandles(chartPoints, chartConfig.intervalSeconds, chartConfig.calendarMonth)
    }
    chartPoints = chartPoints.slice(-chartConfig.displayLimit)
  }

  const token = [pair.baseToken, pair.quoteToken].find((item) => item?.address?.toLowerCase() === tokenAddress)
  const createdAt = numberOrNull(pair.pairCreatedAt)
  const scan = chainId === 'sui' ? null : await scanContract(address, { marketPairs: [pair] })
  const holderCount = scan?.security.holderCount ?? null
  const holderCountSource = holderCount === null ? null : scan?.security.source ?? null
  const listings = matchingPairs.slice(0, 8).map((listingPair) => {
    const listingCreatedAt = numberOrNull(listingPair.pairCreatedAt)
    return {
      dex: listingPair.dexId || 'DEX',
      pairAddress: String(listingPair.pairAddress || ''),
      pairUrl: listingPair.url || '',
      liquidityUsd: numberOrNull(listingPair.liquidity?.usd),
      pairCreatedAt: listingCreatedAt === null ? null : listingCreatedAt < 1_000_000_000_000 ? listingCreatedAt * 1000 : listingCreatedAt,
    }
  })
  return {
    token: { name: token?.name || 'Unknown token', symbol: token?.symbol || '—' },
    market: {
      priceUsd: numberOrNull(pair.priceUsd),
      marketCapUsd: numberOrNull(pair.marketCap),
      fdvUsd: numberOrNull(pair.fdv),
      liquidityUsd: numberOrNull(pair.liquidity?.usd),
      volume24hUsd: numberOrNull(pair.volume?.h24),
      change24h: numberOrNull(pair.priceChange?.h24),
      buys24h: numberOrNull(pair.txns?.h24?.buys),
      sells24h: numberOrNull(pair.txns?.h24?.sells),
      pairCreatedAt: createdAt === null ? null : createdAt < 1_000_000_000_000 ? createdAt * 1000 : createdAt,
      dex: pair.dexId || 'DEX',
      pairUrl: pair.url || '',
      holderCount,
      holderCountSource,
    },
    listings,
    chart: { interval, points: chartPoints },
  }
}

export async function getTrendingMemecoins(limit = maxTrendingCoins) {
  const safeLimit = Math.min(Math.max(Number(limit) || maxTrendingCoins, 1), maxTrendingCoins)
  if (cachedCoins && Date.now() - cachedAt < cacheTtlMs) {
    return { coins: cachedCoins.slice(0, safeLimit), updatedAt: new Date(cachedAt).toISOString(), stale: false }
  }
  if (pendingUpdate) {
    try {
      const coins = await pendingUpdate
      return { coins: coins.slice(0, safeLimit), updatedAt: new Date(cachedAt).toISOString(), stale: false }
    } catch (error) {
      if (cachedCoins && Date.now() - cachedAt < staleCacheTtlMs) {
        return { coins: cachedCoins.slice(0, safeLimit), updatedAt: new Date(cachedAt).toISOString(), stale: true }
      }
      throw error
    }
  }

  pendingUpdate = updateTrendingCoins(maxTrendingCoins)
  try {
    const coins = await pendingUpdate
    return { coins: coins.slice(0, safeLimit), updatedAt: new Date(cachedAt).toISOString(), stale: false }
  } catch (error) {
    if (cachedCoins && Date.now() - cachedAt < staleCacheTtlMs) {
      return { coins: cachedCoins.slice(0, safeLimit), updatedAt: new Date(cachedAt).toISOString(), stale: true }
    }
    throw error
  } finally {
    pendingUpdate = null
  }
}