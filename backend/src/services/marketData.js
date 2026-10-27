const coinIds = [
  'dogecoin', 'shiba-inu', 'pepe', 'dogwifcoin', 'bonk', 'floki',
  'memecoin', 'popcat', 'book-of-meme', 'mog-coin', 'brett', 'turbo',
]

let cachedMarket = null
let cachedAt = 0
const cacheTtlMs = 60_000
const coinDetailsCache = new Map()

export async function getMarket(limit = 50) {
  if (cachedMarket && Date.now() - cachedAt < cacheTtlMs) {
    return cachedMarket.slice(0, limit)
  }

  const url = new URL('https://api.coingecko.com/api/v3/coins/markets')
  url.search = new URLSearchParams({
    vs_currency: 'usd',
    ids: coinIds.join(','),
    order: 'market_cap_desc',
    per_page: String(coinIds.length),
    page: '1',
    sparkline: 'false',
    price_change_percentage: '24h',
  }).toString()

  const headers = { accept: 'application/json' }
  if (process.env.COINGECKO_DEMO_API_KEY) {
    headers['x-cg-demo-api-key'] = process.env.COINGECKO_DEMO_API_KEY
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    throw new Error(`CoinGecko returned ${response.status}`)
  }

  const payload = await response.json()
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected market data response')
  }

  cachedMarket = payload.map((coin, index) => ({
    id: coin.id,
    name: coin.name,
    symbol: String(coin.symbol || '').toUpperCase(),
    image: coin.image,
    price: Number(coin.current_price || 0),
    change24h: Number(coin.price_change_percentage_24h || 0),
    marketCap: Number(coin.market_cap || 0),
    volume: Number(coin.total_volume || 0),
    rank: Number(coin.market_cap_rank || index + 1),
    fullyDilutedValuation: Number(coin.fully_diluted_valuation || 0),
    circulatingSupply: Number(coin.circulating_supply || 0),
    totalSupply: Number(coin.total_supply || 0),
    high24h: Number(coin.high_24h || 0),
    low24h: Number(coin.low_24h || 0),
  }))
  cachedAt = Date.now()

  return cachedMarket.slice(0, limit)
}

export async function getMarketCoinDetails(id, days = 1) {
  if (!coinIds.includes(id)) return null

  const safeDays = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 1
  const cacheKey = `${id}:${safeDays}`
  const cached = coinDetailsCache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < cacheTtlMs) return cached.details

  const coin = (await getMarket(coinIds.length)).find((marketCoin) => marketCoin.id === id)
  if (!coin) return null

  const url = new URL(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart`)
  url.search = new URLSearchParams({ vs_currency: 'usd', days: String(safeDays) }).toString()
  const headers = { accept: 'application/json' }
  if (process.env.COINGECKO_DEMO_API_KEY) {
    headers['x-cg-demo-api-key'] = process.env.COINGECKO_DEMO_API_KEY
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`)

  const payload = await response.json()
  if (!Array.isArray(payload.prices)) throw new Error('Unexpected market chart response')

  const points = payload.prices
    .filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])) && Number(point[1]) > 0)
    .map((point) => ({ timestamp: Number(point[0]), priceUsd: Number(point[1]) }))
  const details = { coin, points }
  coinDetailsCache.set(cacheKey, { details, cachedAt: Date.now() })
  return details
}
