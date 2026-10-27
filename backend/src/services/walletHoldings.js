const goldRushUrl = 'https://api.covalenthq.com/v1'
const dexScreenerUrl = 'https://api.dexscreener.com/tokens/v1'
const balanceCacheTtlMs = 60_000
const maximumTokensPerChain = 300
const goldRushChains = {
  solana: [{ id: 'solana', name: 'solana-mainnet' }],
  evm: [
    { id: 'ethereum', name: 'eth-mainnet' },
    { id: 'base', name: 'base-mainnet' },
    { id: 'bsc', name: 'bsc-mainnet' },
    { id: 'polygon', name: 'polygon-mainnet' },
    { id: 'arbitrum', name: 'arbitrum-mainnet' },
    { id: 'avalanche', name: 'avalanche-mainnet' },
    { id: 'optimism', name: 'optimism-mainnet' },
  ],
}

const balanceCache = new Map()
const pendingRequests = new Map()

function addressKey(chainId, address) {
  return chainId === 'solana' ? address : address.toLowerCase()
}

function parseTokenAmount(balance, decimals) {
  if (typeof balance !== 'string' || !/^\d+$/.test(balance)) return 0
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return 0
  const amount = Number(balance) / (10 ** decimals)
  return Number.isFinite(amount) ? amount : 0
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`)
  return response.json()
}

async function fetchBalances(walletAddress, chain) {
  const url = new URL(`${goldRushUrl}/${chain.name}/address/${encodeURIComponent(walletAddress)}/balances_v2/`)
  url.search = new URLSearchParams({ 'quote-currency': 'USD', 'no-spam': 'true' }).toString()
  const payload = await getJson(url, {
    accept: 'application/json',
    Authorization: `Bearer ${process.env.GOLDRUSH_API_KEY}`,
  })
  if (!Array.isArray(payload?.data?.items)) throw new Error('Wallet balance provider returned an invalid response.')

  return payload.data.items
    .filter((item) => item && item.type === 'cryptocurrency' && item.is_native_token !== true && item.is_spam !== true)
    .map((item) => ({
      chainId: chain.id,
      address: String(item.contract_address || ''),
      name: String(item.contract_name || item.contract_display_name || item.contract_ticker_symbol || 'Unknown token'),
      symbol: String(item.contract_ticker_symbol || '—').toUpperCase(),
      image: String(item.logo_urls?.token_logo_url || ''),
      amount: parseTokenAmount(String(item.balance || ''), Number(item.contract_decimals)),
    }))
    .filter((item) => item.address && item.amount > 0)
    .slice(0, maximumTokensPerChain)
}

async function fetchDexPairs(chainId, tokens) {
  const chunks = []
  for (let offset = 0; offset < tokens.length; offset += 30) {
    const chunk = tokens.slice(offset, offset + 30)
    const addresses = chunk.map((token) => encodeURIComponent(token.address)).join(',')
    chunks.push(getJson(`${dexScreenerUrl}/${encodeURIComponent(chainId)}/${addresses}`, { accept: 'application/json' }))
  }
  const results = await Promise.allSettled(chunks)
  const pairs = results.flatMap((result) => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [])
  if (pairs.length === 0 && results.some((result) => result.status === 'rejected')) {
    throw new Error(`Market lookup failed for ${chainId}.`)
  }
  return pairs
}

async function loadWalletHoldings(walletAddress, walletType) {
  const chains = goldRushChains[walletType]
  const balancesByChain = await Promise.allSettled(chains.map(async (chain) => ({
    chain,
    tokens: await fetchBalances(walletAddress, chain),
  })))
  const tokens = []
  const unavailableChains = []

  balancesByChain.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      tokens.push(...result.value.tokens)
    } else {
      unavailableChains.push(chains[index].id)
      console.warn(`Wallet holdings unavailable for ${chains[index].id}:`, result.reason?.message || result.reason)
    }
  })

  if (unavailableChains.length === chains.length) {
    throw new Error('The wallet portfolio provider could not load holdings for the connected wallet.')
  }
  if (tokens.length === 0) return { holdings: [], unavailableChains, updatedAt: new Date().toISOString() }

  const tokensByChain = new Map()
  for (const token of tokens) {
    if (!tokensByChain.has(token.chainId)) tokensByChain.set(token.chainId, [])
    tokensByChain.get(token.chainId).push(token)
  }

  const pairResults = await Promise.allSettled([...tokensByChain.entries()].map(async ([chainId, chainTokens]) => ({
    chainId,
    pairs: await fetchDexPairs(chainId, chainTokens),
  })))
  const pairsByChain = new Map()
  pairResults.forEach((result, index) => {
    if (result.status === 'fulfilled') pairsByChain.set(result.value.chainId, result.value.pairs)
    else {
      const chainId = [...tokensByChain.keys()][index]
      unavailableChains.push(chainId)
      console.warn(`Wallet holding market prices unavailable for ${chainId}:`, result.reason?.message || result.reason)
    }
  })
  if (pairsByChain.size === 0) {
    throw new Error('Wallet token balances loaded, but market prices are temporarily unavailable.')
  }

  const holdings = tokens.flatMap((token) => {
    const pairs = (pairsByChain.get(token.chainId) || []).filter((pair) => (
      pair.chainId === token.chainId
      && [pair.baseToken?.address, pair.quoteToken?.address]
        .some((address) => address && addressKey(token.chainId, address) === addressKey(token.chainId, token.address))
    ))
    pairs.sort((left, right) => (Number(right.liquidity?.usd) || 0) - (Number(left.liquidity?.usd) || 0))
    const pair = pairs.find((candidate) => {
      const price = Number(candidate.priceUsd)
      return candidate.priceUsd !== null
        && candidate.priceUsd !== undefined
        && candidate.priceUsd !== ''
        && Number.isFinite(price)
        && price > 0
    })
    if (!pair) return []
    const pairToken = [pair.baseToken, pair.quoteToken].find((item) => item?.address && addressKey(token.chainId, item.address) === addressKey(token.chainId, token.address))
    const priceUsd = Number(pair.priceUsd)
    const change24h = pair.priceChange?.h24
    return [{
      chainId: token.chainId,
      chain: String(pair.chainId),
      address: token.address,
      name: pairToken?.name || token.name,
      symbol: String(pairToken?.symbol || token.symbol).toUpperCase(),
      image: pair.info?.imageUrl || token.image,
      amount: token.amount,
      priceUsd,
      valueUsd: token.amount * priceUsd,
      change24h: change24h === null || change24h === undefined || change24h === '' || !Number.isFinite(Number(change24h))
        ? null
        : Number(change24h),
      pairUrl: String(pair.url || ''),
    }]
  })
  holdings.sort((left, right) => right.valueUsd - left.valueUsd)

  return { holdings, unavailableChains, updatedAt: new Date().toISOString() }
}

export async function getWalletHoldings(walletAddress, walletType) {
  if (!process.env.GOLDRUSH_API_KEY) {
    const error = new Error('Wallet holdings are not configured. Set GOLDRUSH_API_KEY in the backend environment.')
    error.code = 'GOLDRUSH_NOT_CONFIGURED'
    throw error
  }
  if (!goldRushChains[walletType]) throw new Error('This wallet network is not supported for holdings.')

  const cacheAddress = walletType === 'solana' ? walletAddress : walletAddress.toLowerCase()
  const key = `${walletType}:${cacheAddress}`
  const cached = balanceCache.get(key)
  if (cached && Date.now() - cached.cachedAt < balanceCacheTtlMs) return cached.data
  if (pendingRequests.has(key)) return pendingRequests.get(key)

  const request = loadWalletHoldings(walletAddress, walletType)
    .then((data) => {
      balanceCache.set(key, { data, cachedAt: Date.now() })
      return data
    })
    .finally(() => pendingRequests.delete(key))
  pendingRequests.set(key, request)
  return request
}
