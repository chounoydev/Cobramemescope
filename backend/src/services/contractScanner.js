import bs58 from 'bs58'

const dexScreenerUrl = 'https://api.dexscreener.com/latest/dex/tokens/'
const dexSearchUrl = 'https://api.dexscreener.com/latest/dex/search/?q='
const rugCheckUrl = 'https://api.rugcheck.xyz/v1/tokens/'
const goPlusUrl = 'https://api.gopluslabs.io/api/v1/token_security/'
const chainIds = {
  ethereum: '1',
  bsc: '56',
  polygon: '137',
  arbitrum: '42161',
  optimism: '10',
  base: '8453',
  avalanche: '43114',
}
const chainNames = {
  ethereum: 'Ethereum',
  bsc: 'BNB Chain',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum',
  optimism: 'Optimism',
  base: 'Base',
  avalanche: 'Avalanche',
}

export class InvalidContractAddressError extends Error {}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function holderCountOrNull(...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '')
  const count = numberOrNull(value)
  return count !== null && Number.isInteger(count) && count >= 0 ? count : null
}

function addressesMatch(left, right, chain) {
  return chain === 'evm' ? left.toLowerCase() === right.toLowerCase() : left === right
}

function detectChain(address) {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return 'evm'
  try {
    const decoded = bs58.decode(address)
    return decoded.length === 32 && bs58.encode(decoded) === address ? 'solana' : null
  } catch {
    return null
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(9_000) })
  if (!response.ok) throw new Error(`Provider returned ${response.status}.`)
  return response.json()
}

function valuePercent(value) {
  const number = numberOrNull(value)
  if (number === null) return null
  return number > 0 && number <= 1 ? number * 100 : number
}

function addPercentCheck(checks, id, label, value, source, subject) {
  const percent = valuePercent(value)
  if (percent === null) {
    checks.push({ id, label, status: 'unknown', detail: `${subject} percentage was not returned.`, source })
    return
  }
  const status = percent >= 25 ? 'danger' : percent >= 5 ? 'caution' : 'clear'
  checks.push({
    id,
    label,
    status,
    value: `${percent.toFixed(2)}%`,
    detail: `${subject} is reported to hold ${percent.toFixed(2)}% of supply.`,
    source,
  })
}

function addBinaryCheck(checks, id, label, value, source, options = {}) {
  if (value === undefined || value === null || value === '') {
    checks.push({ id, label, status: 'unknown', detail: 'This check was not returned by the provider.', source })
    return
  }
  const enabled = value === true || value === 1 || value === '1' || value === 'true'
  const positive = options.reverse ? !enabled : enabled
  checks.push({
    id,
    label,
    status: positive ? options.status || 'danger' : 'clear',
    detail: positive ? options.positiveDetail : options.negativeDetail,
    source,
  })
}

function getDexPair(pairs, address, chain) {
  if (!Array.isArray(pairs)) return null
  return pairs
    .filter((pair) => chain !== 'solana' || pair.chainId === 'solana')
    .sort((left, right) => (numberOrNull(right.liquidity?.usd) || 0) - (numberOrNull(left.liquidity?.usd) || 0))
    .find((pair) => {
      const tokenAddresses = [pair.baseToken?.address, pair.quoteToken?.address].filter(Boolean)
      return tokenAddresses.some((tokenAddress) => addressesMatch(tokenAddress, address, chain))
    }) || null
}

function addMarketChecks(checks, pair) {
  if (!pair) {
    checks.push({ id: 'market-pair', label: 'DEX market', status: 'unknown', detail: 'No matching DEX pair was returned. This does not prove the token is safe or unsafe.', source: 'DexScreener' })
    return
  }

  const liquidity = numberOrNull(pair.liquidity?.usd)
  if (liquidity !== null) {
    const status = liquidity < 2_000 ? 'danger' : liquidity < 10_000 ? 'caution' : 'clear'
    checks.push({
      id: 'liquidity',
      label: 'Pool liquidity',
      status,
      value: `$${liquidity.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      detail: liquidity < 10_000 ? 'Thin liquidity can make exits costly or impossible during a sell-off.' : 'Reported liquidity in the largest matching pool.',
      source: 'DexScreener',
    })
  } else {
    checks.push({ id: 'liquidity', label: 'Pool liquidity', status: 'unknown', detail: 'Pool liquidity was not returned.', source: 'DexScreener' })
  }

  const createdAt = numberOrNull(pair.pairCreatedAt)
  if (createdAt !== null && createdAt > 0) {
    const createdMs = createdAt < 1_000_000_000_000 ? createdAt * 1000 : createdAt
    const ageHours = Math.max(0, (Date.now() - createdMs) / 3_600_000)
    checks.push({
      id: 'pair-age',
      label: 'Pool age',
      status: ageHours < 24 ? 'caution' : 'clear',
      value: ageHours < 24 ? `${Math.max(1, Math.floor(ageHours))}h` : `${Math.floor(ageHours / 24)}d`,
      detail: ageHours < 24 ? 'A newly created pool has little trading history to assess.' : 'Age of the largest matching DEX pool.',
      source: 'DexScreener',
    })
  } else {
    checks.push({ id: 'pair-age', label: 'Pool age', status: 'unknown', detail: 'Pool creation time was not returned.', source: 'DexScreener' })
  }

  const buys = numberOrNull(pair.txns?.h24?.buys)
  const sells = numberOrNull(pair.txns?.h24?.sells)
  if (buys !== null && sells !== null) {
    const status = buys > 0 && sells === 0 ? 'caution' : 'clear'
    checks.push({
      id: 'sell-activity',
      label: '24h buy / sell activity',
      status,
      value: `${buys} / ${sells}`,
      detail: status === 'caution' ? 'Buys were reported but no sells appeared in this window; sellability is not established.' : 'Observed transaction counts, not a guarantee that future sells will succeed.',
      source: 'DexScreener',
    })
  } else {
    checks.push({ id: 'sell-activity', label: '24h buy / sell activity', status: 'unknown', detail: 'Transaction counts were not returned.', source: 'DexScreener' })
  }

  const priceChange = numberOrNull(pair.priceChange?.h24)
  if (priceChange !== null) {
    const volatile = Math.abs(priceChange) >= 100
    checks.push({
      id: 'price-move',
      label: '24h price move',
      status: volatile ? 'caution' : 'clear',
      value: `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}%`,
      detail: volatile ? 'An unusually large one-day move increases volatility and FOMO risk.' : 'Observed 24-hour price change.',
      source: 'DexScreener',
    })
  } else {
    checks.push({ id: 'price-move', label: '24h price move', status: 'unknown', detail: 'Price change was not returned.', source: 'DexScreener' })
  }
}

function addSolanaChecks(checks, report) {
  const source = 'RugCheck'
  if (!report) {
    checks.push({ id: 'rugcheck', label: 'Solana contract analysis', status: 'unknown', detail: 'RugCheck did not return a report. Authority and holder checks are unavailable.', source })
    return
  }

  const token = report.token || {}
  const mintAuthority = report.mintAuthority ?? token.mintAuthority
  const freezeAuthority = report.freezeAuthority ?? token.freezeAuthority
  addBinaryCheck(checks, 'mint-authority', 'Mint authority', mintAuthority ? '1' : mintAuthority === null || mintAuthority === '' ? '0' : undefined, source, {
    positiveDetail: 'A mint authority is still assigned and may be able to increase supply.',
    negativeDetail: 'No mint authority was reported.',
  })
  addBinaryCheck(checks, 'freeze-authority', 'Freeze authority', freezeAuthority ? '1' : freezeAuthority === null || freezeAuthority === '' ? '0' : undefined, source, {
    positiveDetail: 'A freeze authority is still assigned and may be able to freeze token accounts.',
    negativeDetail: 'No freeze authority was reported.',
  })

  const risks = Array.isArray(report.risks) ? report.risks : []
  for (const [index, risk] of risks.entries()) {
    const level = String(risk.level || '').toLowerCase()
    const status = ['danger', 'critical', 'high'].includes(level) ? 'danger' : ['warn', 'warning', 'medium'].includes(level) ? 'caution' : 'unknown'
    checks.push({
      id: `rugcheck-${index}`,
      label: risk.name || 'RugCheck risk',
      status,
      value: risk.value || undefined,
      detail: risk.description || `RugCheck returned a ${level || 'unclassified'} risk signal.`,
      source,
    })
  }
  if (risks.length === 0) {
    checks.push({ id: 'rugcheck-risks', label: 'RugCheck risk rules', status: 'clear', detail: 'No risk items were listed in the available RugCheck report; this is not a safety guarantee.', source })
  }

  const creator = report.creator || token.creator
  const holders = Array.isArray(report.topHolders) ? report.topHolders : Array.isArray(report.holders) ? report.holders : []
  if (holders.length) {
    const creatorHolder = creator && holders.find((holder) => [holder.owner, holder.address].includes(creator))
    if (creatorHolder) addPercentCheck(checks, 'developer-hold', 'Creator in top holders', creatorHolder.pct ?? creatorHolder.percent, source, 'The token creator')
    else checks.push({ id: 'developer-hold', label: 'Creator holdings', status: 'unknown', detail: creator ? 'Creator was not found among the returned top holders; a smaller balance may still exist.' : 'Creator address was not returned, so developer holdings could not be matched.', source })

    const percentages = holders.map((holder) => valuePercent(holder.pct ?? holder.percent)).filter((percent) => percent !== null)
    if (percentages.length) {
      const concentration = percentages.slice(0, 10).reduce((total, percent) => total + percent, 0)
      checks.push({
        id: 'holder-concentration',
        label: 'Top-holder concentration',
        status: concentration >= 75 ? 'danger' : concentration >= 50 ? 'caution' : 'clear',
        value: `${concentration.toFixed(1)}%`,
        detail: `The top ${percentages.length} reported holders control ${concentration.toFixed(1)}% of supply.`,
        source,
      })
    } else {
      checks.push({ id: 'holder-concentration', label: 'Top-holder concentration', status: 'unknown', detail: 'Holder percentages were not returned.', source })
    }
  } else {
    checks.push({ id: 'developer-hold', label: 'Creator holdings', status: 'unknown', detail: 'Top-holder data was not returned.', source })
    checks.push({ id: 'holder-concentration', label: 'Top-holder concentration', status: 'unknown', detail: 'Top-holder data was not returned.', source })
  }

  const lpLocked = report.lpLockedPct
  if (lpLocked !== undefined && lpLocked !== null && Number.isFinite(Number(lpLocked))) {
    const percent = valuePercent(lpLocked)
    checks.push({
      id: 'lp-lock',
      label: 'Reported LP locked',
      status: percent < 20 ? 'danger' : percent < 50 ? 'caution' : 'clear',
      value: `${percent.toFixed(1)}%`,
      detail: 'RugCheck-reported share of liquidity locked; verify lock terms and expiry independently.',
      source,
    })
  } else {
    checks.push({ id: 'lp-lock', label: 'Reported LP locked', status: 'unknown', detail: 'LP lock coverage was not returned.', source })
  }
}

function addEvmChecks(checks, security) {
  const source = 'GoPlus'
  if (!security) {
    checks.push({ id: 'goplus', label: 'EVM contract analysis', status: 'unknown', detail: 'GoPlus security data was unavailable for this chain or address.', source })
    return
  }

  addBinaryCheck(checks, 'honeypot', 'Honeypot simulation', security.is_honeypot, source, { positiveDetail: 'GoPlus simulation identified honeypot behavior.', negativeDetail: 'GoPlus did not identify honeypot behavior in its simulation.' })
  addBinaryCheck(checks, 'open-source', 'Source code visibility', security.is_open_source, source, { reverse: true, status: 'caution', positiveDetail: 'Verified source code was not available; hidden behavior may be harder to assess.', negativeDetail: 'Source code was reported as open.' })
  addBinaryCheck(checks, 'mintable', 'Minting control', security.is_mintable, source, { positiveDetail: 'The contract may allow additional tokens to be minted.', negativeDetail: 'No mint function was reported.' })
  addBinaryCheck(checks, 'blacklist', 'Blacklist control', security.is_blacklisted, source, { positiveDetail: 'The contract reports a blacklist capability.', negativeDetail: 'No blacklist capability was reported.' })
  addBinaryCheck(checks, 'hidden-owner', 'Hidden owner', security.hidden_owner, source, { positiveDetail: 'A hidden owner was reported.', negativeDetail: 'No hidden owner was reported.' })
  addBinaryCheck(checks, 'sell-limit', 'Sell restrictions', security.cannot_sell_all, source, { positiveDetail: 'The contract reports a restriction on selling the full position.', negativeDetail: 'No full-position sell restriction was reported.' })
  addBinaryCheck(checks, 'owner-balance-control', 'Owner balance control', security.owner_change_balance, source, { positiveDetail: 'The owner may be able to change holder balances.', negativeDetail: 'No owner balance-changing function was reported.' })

  const developerShare = security.creator_percent ?? security.owner_percent
  addPercentCheck(checks, 'developer-hold', 'Developer / owner share', developerShare, source, 'The reported creator or owner')
  for (const [field, label] of [['buy_tax', 'Reported buy tax'], ['sell_tax', 'Reported sell tax']]) {
    const raw = security[field]
    const numeric = Number(raw)
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(numeric)) {
      checks.push({ id: field, label, status: 'unknown', detail: 'Tax data was not returned by the provider.', source })
    } else {
      const percent = numeric === 1 ? 100 : numeric > 0 && numeric < 1 ? numeric * 100 : numeric
      checks.push({
        id: field,
        label,
        status: percent >= 50 ? 'danger' : percent >= 5 ? 'caution' : 'clear',
        value: `${percent.toFixed(2)}%`,
        detail: percent >= 5 ? `The provider reports a ${percent.toFixed(2)}% ${field === 'buy_tax' ? 'buy' : 'sell'} tax.` : 'Provider-reported tax rate.',
        source,
      })
    }
  }
}

function addIdentityCheck(checks, token, address, chain, chainId, pairs, available) {
  const name = String(token.name || '').trim().toLocaleLowerCase()
  const symbol = String(token.symbol || '').trim().toLocaleLowerCase()
  if (!name || !symbol) {
    checks.push({ id: 'token-identity', label: 'Look-alike token screening', status: 'unknown', detail: 'Token name or symbol was unavailable, so a metadata collision check could not run.', source: 'DexScreener' })
    return
  }
  if (!available) {
    checks.push({ id: 'token-identity', label: 'Look-alike token screening', status: 'unknown', detail: 'DexScreener identity search was unavailable; look-alike status is unknown.', source: 'DexScreener' })
    return
  }

  const matches = (Array.isArray(pairs) ? pairs : []).flatMap((pair) => {
    if (pair.chainId !== chainId) return []
    const candidate = [pair.baseToken, pair.quoteToken].find((item) => {
      return item?.address
        && !addressesMatch(item.address, address, chain)
        && String(item.name || '').trim().toLocaleLowerCase() === name
        && String(item.symbol || '').trim().toLocaleLowerCase() === symbol
    })
    return candidate ? [{ candidate, pair }] : []
  })
  if (!matches.length) {
    checks.push({ id: 'token-identity', label: 'Look-alike token screening', status: 'clear', detail: 'No exact same-network name and symbol collision appeared in DexScreener search. This does not authenticate the token or rule out unindexed copies.', source: 'DexScreener' })
    return
  }

  matches.sort((left, right) => {
    const leftCreated = numberOrNull(left.pair.pairCreatedAt) || Number.MAX_SAFE_INTEGER
    const rightCreated = numberOrNull(right.pair.pairCreatedAt) || Number.MAX_SAFE_INTEGER
    return leftCreated - rightCreated || (numberOrNull(right.pair.liquidity?.usd) || 0) - (numberOrNull(left.pair.liquidity?.usd) || 0)
  })
  const candidate = matches[0].candidate
  const candidateAddress = String(candidate.address)
  const shortAddress = candidateAddress.length > 14 ? `${candidateAddress.slice(0, 6)}...${candidateAddress.slice(-4)}` : candidateAddress
  checks.push({
    id: 'token-identity',
    label: 'Possible look-alike token',
    status: 'caution',
    value: shortAddress,
    detail: `DexScreener lists the same name and symbol at another ${chain === 'solana' ? 'Solana' : 'same-network'} address. Name collisions can be legitimate; compare both contract addresses with the project's official source before interacting.`,
    source: 'DexScreener',
  })
}

export async function scanContract(input, { marketPairs, identityPairs } = {}) {
  const address = String(input || '').trim()
  const chain = detectChain(address)
  if (!chain) throw new InvalidContractAddressError('Enter a valid Solana mint or EVM contract address.')

  let pairs = Array.isArray(marketPairs) ? marketPairs : []
  let marketAvailable = Array.isArray(marketPairs)
  if (!marketAvailable) {
    try {
      const market = await fetchJson(`${dexScreenerUrl}${encodeURIComponent(address)}`)
      pairs = Array.isArray(market.pairs) ? market.pairs : []
      marketAvailable = true
    } catch {
      marketAvailable = false
    }
  }

  const pair = getDexPair(pairs, address, chain)
  const checks = []
  addMarketChecks(checks, pair)

  let securityData = null
  let securityAvailable = false
  let securitySource = chain === 'solana' ? 'RugCheck' : 'GoPlus'
  if (chain === 'solana') {
    try {
      securityData = await fetchJson(`${rugCheckUrl}${encodeURIComponent(address)}/report`)
      securityAvailable = true
    } catch {
      securityAvailable = false
    }
    addSolanaChecks(checks, securityData)
  } else {
    const chainId = chainIds[pair?.chainId]
    if (chainId) {
      try {
        const url = new URL(`${goPlusUrl}${chainId}`)
        url.searchParams.set('contract_addresses', address)
        const result = await fetchJson(url)
        const securityMap = result.result || {}
        securityData = Object.entries(securityMap).find(([key]) => key.toLowerCase() === address.toLowerCase())?.[1] || null
        securityAvailable = String(result.code) === '1' && Boolean(securityData)
      } catch {
        securityAvailable = false
      }
    }
    addEvmChecks(checks, securityData)
  }

  const token = chain === 'evm'
    ? { name: securityData?.token_name || '', symbol: securityData?.token_symbol || '' }
    : { name: securityData?.tokenMeta?.name || securityData?.token?.name || '', symbol: securityData?.tokenMeta?.symbol || securityData?.token?.symbol || '' }
  const pairToken = pair && [pair.baseToken, pair.quoteToken].find((item) => item?.address && addressesMatch(item.address, address, chain))
  const identityToken = { name: token.name || pairToken?.name || '', symbol: token.symbol || pairToken?.symbol || '' }
  const identityChainId = chain === 'solana' ? 'solana' : pair?.chainId
  let matchingPairs = identityPairs
  let identityAvailable = Array.isArray(identityPairs)
  if (identityPairs === undefined && identityToken.name && identityToken.symbol && identityChainId) {
    try {
      const identity = await fetchJson(`${dexSearchUrl}${encodeURIComponent(`${identityToken.name} ${identityToken.symbol}`)}`)
      matchingPairs = Array.isArray(identity.pairs) ? identity.pairs : []
      identityAvailable = true
    } catch {
      identityAvailable = false
    }
  }
  addIdentityCheck(checks, identityToken, address, chain, identityChainId, matchingPairs, identityAvailable)
  const flaggedCount = checks.filter((check) => check.status === 'danger').length
  const cautionCount = checks.filter((check) => check.status === 'caution').length
  const unknownCount = checks.filter((check) => check.status === 'unknown').length

  return {
    address,
    chain: chain === 'solana' ? 'Solana' : chainNames[pair?.chainId] || pair?.chainId || 'EVM',
    token: {
      name: identityToken.name || 'Unknown token',
      symbol: identityToken.symbol || '—',
    },
    market: pair ? {
      dex: pair.dexId || 'DEX',
      pairAddress: pair.pairAddress || '',
      url: pair.url || '',
      priceUsd: numberOrNull(pair.priceUsd),
      liquidityUsd: numberOrNull(pair.liquidity?.usd),
      fdv: numberOrNull(pair.fdv),
      volume24h: numberOrNull(pair.volume?.h24),
      buys24h: numberOrNull(pair.txns?.h24?.buys),
      sells24h: numberOrNull(pair.txns?.h24?.sells),
      pairCreatedAt: numberOrNull(pair.pairCreatedAt),
    } : null,
    security: {
      source: securitySource,
      available: securityAvailable,
      score: chain === 'solana' && securityData ? securityData.score_normalised ?? securityData.score ?? null : null,
      holderCount: chain === 'solana'
        ? holderCountOrNull(securityData?.totalHolders, securityData?.total_holders, securityData?.token?.holderCount, securityData?.token?.holder_count)
        : holderCountOrNull(securityData?.holder_count, securityData?.holderCount),
      holders: chain === 'solana' && securityData ? (securityData.topHolders || securityData.holders || []).slice(0, 10).map((holder) => ({
        address: holder.owner || holder.address || '',
        percent: valuePercent(holder.pct ?? holder.percent),
        insider: Boolean(holder.insider),
        tag: holder.tag || '',
      })) : [],
    },
    checks,
    summary: {
      level: flaggedCount ? 'danger' : cautionCount ? 'caution' : unknownCount ? 'limited' : 'clear',
      flaggedCount,
      cautionCount,
      unknownCount,
    },
    sources: {
      market: marketAvailable ? 'available' : 'unavailable',
      security: securityAvailable ? 'available' : 'unavailable',
    },
    checkedAt: new Date().toISOString(),
  }
}