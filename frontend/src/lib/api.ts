export type Coin = {
  id: string
  name: string
  symbol: string
  image: string
  price: number
  change24h: number
  marketCap: number
  volume: number
  rank: number
  fullyDilutedValuation?: number
  circulatingSupply?: number
  totalSupply?: number
  high24h?: number
  low24h?: number
}

export type CoinMarketDetails = {
  coin: Coin
  points: { timestamp: number; priceUsd: number }[]
}

export type TrendingMemecoin = {
  rank: number
  address: string
  chainId: string
  chain: string
  name: string
  symbol: string
  image: string
  pairUrl: string
  dex: string
  ageHours: number
  priceUsd: number | null
  marketCapUsd?: number | null
  change24h: number
  liquidityUsd: number
  volume24h: number
  buys24h: number
  sells24h: number
  momentumScore: number
  momentumLabel: string
  promoted: boolean
  boostAmount: number
  marketStatus?: 'LIVE' | 'BEARISH' | 'THIN LIQUIDITY' | 'UNAVAILABLE' | 'STALE'
  marketUpdatedAt?: string
  watchStartedAt?: string
  watchStartPriceUsd?: number | null
  lastObservedPriceUsd?: number | null
  lastPriceAlertPercent?: number
  lastPriceAlertAt?: string
  risk: {
    level: 'danger' | 'caution' | 'limited' | 'clear'
    label: string
    flaggedCount: number
    cautionCount: number
    unknownCount: number
    reasons: string[]
  }
}

export type TrendingMemecoinDetails = {
  token: { name: string; symbol: string }
  market: {
    priceUsd: number | null
    marketCapUsd: number | null
    fdvUsd: number | null
    liquidityUsd: number | null
    volume24hUsd: number | null
    change24h: number | null
    buys24h: number | null
    sells24h: number | null
    pairCreatedAt: number | null
    dex: string
    pairUrl: string
    holderCount: number | null
    holderCountSource: string | null
  }
  listings: {
    dex: string
    pairAddress: string
    pairUrl: string
    liquidityUsd: number | null
    pairCreatedAt: number | null
  }[]
  chart: { interval: string; points: { timestamp: number; open: number; high: number; low: number; close: number; priceUsd: number; volumeUsd: number }[] }
}

export type MarketChartInterval = '1m' | '5m' | '1h' | '2h' | '3h' | '5h' | '8h' | '1d' | '1mo'

export type TrackedMarketUpdate = {
  chainId: string
  address: string
  priceUsd?: number | null
  change24h?: number | null
  liquidityUsd?: number | null
  volume24h?: number | null
  buys24h?: number
  sells24h?: number
  pairUrl?: string
  dex?: string
  marketStatus: 'LIVE' | 'BEARISH' | 'THIN LIQUIDITY' | 'UNAVAILABLE'
  marketUpdatedAt?: string
}

export type DonorDashboard = {
  ownerAddress: string
  windowDays: number
  scannedTransactions: number
  decodedTransfers: number
  activeDonors: number
  totalSol: number
  topDonors: { rank: number; address: string; totalSol: number; transferCount: number; lastSeen: string }[]
  recentTransfers: { signature: string; donor: string; sol: number; timestamp: string }[]
  loginStats: {
    today: number
    thisYear: number
    allTime: number
    activeUsers24h: number
    emailUsers24h: number
    walletUsers24h: number
    walletConnectionsToday: number
    contractScansToday: number
    tokensTrackedToday: number
  } | null
  analyticsError?: string | null
  updatedAt: string
}

export type WalletTokenHolding = {
  chainId: string
  chain: string
  address: string
  name: string
  symbol: string
  image: string
  amount: number
  priceUsd: number
  valueUsd: number
  change24h: number | null
  pairUrl: string
}

export type LandingEvent = {
  id: string
  badge: string
  title: string
  description: string
  eventDate: string
  cta: string
  imageUrl: string
  displayOrder: number
}

export type StaffWallet = {
  walletAddress: string
  createdAt: string
}

export type SeasonalTheme = 'none' | 'christmas' | 'halloween' | 'new-year'
const seasonalThemeValues = new Set<string>(['none', 'christmas', 'halloween', 'new-year'])

function isSeasonalTheme(value: unknown): value is SeasonalTheme {
  return typeof value === 'string' && seasonalThemeValues.has(value)
}

export type ScanCheck = {
  id: string
  label: string
  status: 'danger' | 'caution' | 'clear' | 'unknown'
  value?: string
  detail: string
  source: string
}

export type ContractScan = {
  address: string
  chain: string
  token: { name: string; symbol: string }
  market: {
    dex: string
    url: string
    priceUsd: number | null
    liquidityUsd: number | null
    fdv: number | null
    volume24h: number | null
    buys24h: number | null
    sells24h: number | null
    pairCreatedAt: number | null
  } | null
  security: {
    source: string
    available: boolean
    score: number | null
    holders: { address: string; percent: number | null; insider: boolean; tag: string }[]
  }
  checks: ScanCheck[]
  summary: { level: 'danger' | 'caution' | 'limited' | 'clear'; flaggedCount: number; cautionCount: number; unknownCount: number }
  sources: { market: string; security: string }
  checkedAt: string
}

const configuredApiBaseUrl = import.meta.env.VITE_API_URL?.trim() || ''
const apiBaseIsLoopback = (() => {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(configuredApiBaseUrl).hostname)
  } catch {
    return false
  }
})()
const apiBaseUrl = import.meta.env.DEV || apiBaseIsLoopback ? '' : configuredApiBaseUrl

export type AssistantMessage = { role: 'user' | 'model'; text: string }

export async function askMemeScopeAssistant(
  message: string,
  history: AssistantMessage[],
  scanContext: string,
  token: string,
): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, history, scanContext }),
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Could not reach the MemeScope API. Check that the backend is running and the API URL is correct.')
    }
    throw error
  }
  const payload = await readApiResponse<{ answer?: string; error?: string }>(response, 'The AI guide could not answer right now.')
  if (!response.ok || !payload.answer) throw new Error(payload.error || 'The AI guide could not answer right now.')
  return payload.answer
}

async function readApiResponse<T extends { error?: string }>(response: Response, fallbackError: string): Promise<T> {
  const body = await response.text()
  if (!body) return {} as T
  try {
    return JSON.parse(body) as T
  } catch {
    return { error: body.trim() || fallbackError } as T
  }
}

export async function fetchTrendingMemecoins(): Promise<{ coins: TrendingMemecoin[]; updatedAt: string; windowDays: number; refreshSeconds: number; excludedChange24h: number }> {
  const response = await fetch(`${apiBaseUrl}/api/market/trending?limit=50`)
  const payload = await readApiResponse<{ coins?: TrendingMemecoin[]; updatedAt?: string; windowDays?: number; refreshSeconds?: number; excludedChange24h?: number; error?: string }>(response, 'Could not load new market launches.')
  if (!response.ok || !Array.isArray(payload.coins)) throw new Error(payload.error || 'Could not load new market launches.')
  return {
    coins: payload.coins,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    windowDays: payload.windowDays || 30,
    refreshSeconds: payload.refreshSeconds || 60,
    excludedChange24h: payload.excludedChange24h ?? -20,
  }
}

export async function fetchTrendingMemecoinDetails(chainId: string, address: string, interval: MarketChartInterval = '1h', signal?: AbortSignal): Promise<TrendingMemecoinDetails> {
  const query = new URLSearchParams({ interval })
  const response = await fetch(`${apiBaseUrl}/api/market/trending/${encodeURIComponent(chainId)}/${encodeURIComponent(address)}?${query}`, { signal })
  const payload = await readApiResponse<TrendingMemecoinDetails & { error?: string }>(response, 'Could not load token market details. The API may be unavailable or timed out.')
  if (!response.ok || !payload.market || !Array.isArray(payload.chart?.points)) throw new Error(payload.error || 'Could not load token market details.')
  return payload
}

export async function fetchTrackedMarketUpdates(tokens: { chainId: string; address: string }[]): Promise<TrackedMarketUpdate[]> {
  if (tokens.length === 0) return []
  const response = await fetch(`${apiBaseUrl}/api/market/trending/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokens }),
  })
  const payload = await response.json() as { updates?: TrackedMarketUpdate[]; error?: string }
  if (!response.ok || !Array.isArray(payload.updates)) throw new Error(payload.error || 'Could not refresh saved token markets.')
  return payload.updates
}

export async function fetchDonorDashboard(token: string): Promise<DonorDashboard> {
  const response = await fetch(`${apiBaseUrl}/api/admin/donors`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await response.json() as DonorDashboard & { error?: string }
  if (!response.ok) throw new Error(payload.error || 'Could not load the private donor dashboard.')
  return payload
}

async function adminRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })
  const payload = response.status === 204 ? null : await response.json() as { error?: string }
  if (!response.ok) throw new Error(payload?.error || 'The private admin request failed.')
  return payload as T
}

export function fetchAdminAccess(token: string): Promise<{ role: 'owner' | 'staff'; walletAddress: string }> {
  return adminRequest(token, '/api/admin/access')
}

export async function fetchLandingEvents(): Promise<LandingEvent[]> {
  const response = await fetch(`${apiBaseUrl}/api/content/events`)
  const payload = await response.json() as { events?: LandingEvent[]; error?: string }
  if (!response.ok || !Array.isArray(payload.events)) throw new Error(payload.error || 'Could not load landing events.')
  return payload.events
}

export async function fetchSiteTheme(): Promise<SeasonalTheme> {
  const response = await fetch(`${apiBaseUrl}/api/content/theme`, { cache: 'no-store' })
  const payload = await readApiResponse<{ theme?: SeasonalTheme; error?: string }>(response, 'Could not load the site appearance.')
  if (!response.ok || !isSeasonalTheme(payload.theme)) {
    throw new Error(payload.error || 'The site appearance was not returned.')
  }
  return payload.theme
}

export async function saveAdminSiteTheme(token: string, theme: SeasonalTheme): Promise<SeasonalTheme> {
  const payload = await adminRequest<{ theme?: SeasonalTheme }>(token, '/api/admin/theme', {
    method: 'PUT',
    body: JSON.stringify({ theme }),
  })
  if (!isSeasonalTheme(payload.theme)) {
    throw new Error('The saved site appearance was not returned.')
  }
  return payload.theme
}

export async function fetchAdminEvents(token: string): Promise<LandingEvent[]> {
  const payload = await adminRequest<{ events?: LandingEvent[] }>(token, '/api/admin/events')
  if (!Array.isArray(payload.events)) throw new Error('The event list was not returned.')
  return payload.events
}

export function saveAdminEvent(token: string, event: Omit<LandingEvent, 'id' | 'displayOrder'>, id: string | null): Promise<LandingEvent> {
  return adminRequest(token, id ? `/api/admin/events/${encodeURIComponent(id)}` : '/api/admin/events', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(event),
  })
}

export async function uploadAdminEventImage(token: string, file: File): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/admin/event-images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type,
    },
    body: file,
  })
  const payload = await readApiResponse<{ id?: string; error?: string }>(response, 'Could not upload the event image.')
  if (!response.ok || !payload.id || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(payload.id)) {
    throw new Error(payload.error || 'The uploaded event image was not returned.')
  }
  return `${apiBaseUrl}/api/content/event-images/${payload.id}`
}

export async function deleteLandingEvent(token: string, id: string): Promise<void> {
  await adminRequest<null>(token, `/api/admin/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function fetchAdminStaff(token: string): Promise<StaffWallet[]> {
  const payload = await adminRequest<{ staff?: StaffWallet[] }>(token, '/api/admin/staff')
  if (!Array.isArray(payload.staff)) throw new Error('The staff list was not returned.')
  return payload.staff
}

export function addStaffWallet(token: string, walletAddress: string): Promise<StaffWallet> {
  return adminRequest(token, '/api/admin/staff', { method: 'POST', body: JSON.stringify({ walletAddress }) })
}

export async function deleteStaffWallet(token: string, walletAddress: string): Promise<void> {
  await adminRequest<null>(token, `/api/admin/staff/${encodeURIComponent(walletAddress)}`, { method: 'DELETE' })
}

export async function fetchContractScan(address: string): Promise<ContractScan> {
  const response = await fetch(`${apiBaseUrl}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  const payload = await response.json() as ContractScan & { error?: string }
  if (!response.ok) throw new Error(payload.error || 'Could not scan this contract.')
  return payload
}

export async function requestWalletChallenge(address: string): Promise<{ nonce: string; message: string }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/wallet/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  const payload = await readApiResponse<{ nonce?: string; message?: string; error?: string }>(response, 'Could not start wallet sign-in.')
  if (!response.ok || !payload.nonce || !payload.message) throw new Error(payload.error || 'Could not start wallet sign-in.')
  return { nonce: payload.nonce, message: payload.message }
}

export async function verifyWalletLogin(address: string, nonce: string, signature: number[]): Promise<{ token: string; profile: AuthProfile; profileAvailable: boolean }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/wallet/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, nonce, signature }),
  })
  const payload = await readApiResponse<{ token?: string; profile?: AuthProfile; profileAvailable?: boolean; error?: string }>(response, 'Could not verify the wallet signature.')
  if (!response.ok || !payload.token || !payload.profile) throw new Error(payload.error || 'Could not verify the wallet signature.')
  return { token: payload.token, profile: payload.profile, profileAvailable: payload.profileAvailable !== false }
}

export async function requestEvmWalletChallenge(address: string, chainId: number): Promise<{ nonce: string; message: string }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/wallet/evm-challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, chainId }),
  })
  const payload = await readApiResponse<{ nonce?: string; message?: string; error?: string }>(response, 'Could not start EVM wallet sign-in.')
  if (!response.ok || !payload.nonce || !payload.message) throw new Error(payload.error || 'Could not start EVM wallet sign-in.')
  return { nonce: payload.nonce, message: payload.message }
}

export type AuthProfile = { username: string | null; avatarSeed: number; trackedWalletAddress?: string | null; deletionScheduledAt?: string | null }

export async function verifyEvmWalletLogin(address: string, nonce: string, signature: string): Promise<{ token: string; profile: AuthProfile; profileAvailable: boolean }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/wallet/evm-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, nonce, signature }),
  })
  const payload = await readApiResponse<{ token?: string; profile?: AuthProfile; profileAvailable?: boolean; error?: string }>(response, 'Could not verify the EVM wallet signature.')
  if (!response.ok || !payload.token || !payload.profile) throw new Error(payload.error || 'Could not verify the EVM wallet signature.')
  return { token: payload.token, profile: payload.profile, profileAvailable: payload.profileAvailable !== false }
}

async function emailAuth(path: 'login' | 'register', email: string, password: string, username?: string): Promise<{ token: string; email: string; profile: AuthProfile }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, username }),
  })
  const payload = await readApiResponse<{ token?: string; user?: { email?: string }; profile?: AuthProfile; error?: string }>(response, 'Email sign-in failed.')
  if (!response.ok || !payload.token || !payload.user?.email) throw new Error(payload.error || 'Email sign-in failed.')
  const profile = payload.profile || await fetchAuthProfile(payload.token)
  return { token: payload.token, email: payload.user.email, profile }
}

export function loginWithEmail(email: string, password: string) {
  return emailAuth('login', email, password)
}

export function registerWithEmail(email: string, password: string, username: string) {
  return emailAuth('register', email, password, username)
}

export async function fetchAuthProfile(token: string): Promise<AuthProfile> {
  const response = await fetch(`${apiBaseUrl}/api/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await readApiResponse<{ profile?: AuthProfile; error?: string }>(response, 'Could not load your profile.')
  if (!response.ok || !payload.profile) throw new Error(payload.error || 'Could not load your profile.')
  return payload.profile
}

export async function saveAuthProfile(token: string, username: string): Promise<AuthProfile> {
  const response = await fetch(`${apiBaseUrl}/api/auth/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  const payload = await readApiResponse<{ profile?: AuthProfile; error?: string }>(response, 'Could not save your profile.')
  if (!response.ok || !payload.profile) throw new Error(payload.error || 'Could not save your profile.')
  return payload.profile
}

export async function requestTrackedWalletChallenge(
  token: string,
  walletAddress: string,
  walletType: 'solana' | 'evm',
  chainId?: number,
): Promise<{ nonce: string; message: string }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/profile/tracked-wallet/challenge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, walletType, chainId }),
  })
  const payload = await readApiResponse<{ nonce?: string; message?: string; error?: string }>(response, 'Could not prepare wallet linking.')
  if (!response.ok || !payload.nonce || !payload.message) throw new Error(payload.error || 'Could not prepare wallet linking.')
  return { nonce: payload.nonce, message: payload.message }
}

export async function verifyTrackedWalletLink(
  token: string,
  walletAddress: string,
  walletType: 'solana' | 'evm',
  nonce: string,
  signature: number[] | string,
): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/auth/profile/tracked-wallet/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, walletType, nonce, signature }),
  })
  const payload = await readApiResponse<{ trackedWalletAddress?: string; error?: string }>(response, 'Could not link this wallet.')
  if (!response.ok) throw new Error(payload.error || 'Could not save your tracking wallet.')
  if (typeof payload.trackedWalletAddress !== 'string') throw new Error('The linked wallet response was invalid.')
  return payload.trackedWalletAddress
}

export async function removeTrackedWalletLink(token: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/auth/profile/tracked-wallet`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await readApiResponse<{ error?: string }>(response, 'Could not unlink your wallet.')
  if (!response.ok) throw new Error(payload.error || 'Could not unlink your wallet.')
}

export async function deleteAuthAccount(token: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/auth/account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await readApiResponse<{ deletionScheduledAt?: string; error?: string }>(response, 'Could not schedule account deletion.')
  if (response.ok && payload.deletionScheduledAt) return payload.deletionScheduledAt
  if (response.ok) throw new Error('The account deletion date was not returned.')
  throw new Error(payload.error || 'Could not schedule account deletion.')
}

export async function cancelAuthAccountDeletion(token: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/auth/account/cancel-deletion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await readApiResponse<{ error?: string }>(response, 'Could not cancel account deletion.')
  if (!response.ok) throw new Error(payload.error || 'Could not cancel account deletion.')
}

const analyticsVisitorStorageKey = 'memescope-visitor-id'

function getAnalyticsVisitorId() {
  let visitorId = localStorage.getItem(analyticsVisitorStorageKey)
  if (!visitorId) {
    visitorId = crypto.randomUUID()
    localStorage.setItem(analyticsVisitorStorageKey, visitorId)
  }
  return visitorId
}

export async function recordSiteActivity(eventType: 'site_visit' | 'wallet_connect' | 'contract_scan' | 'token_track', walletAddress?: string): Promise<void> {
  try {
    await fetch(`${apiBaseUrl}/api/analytics/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: getAnalyticsVisitorId(), eventType, walletAddress }),
    })
  } catch {
    // Analytics is best-effort and must not block app use.
  }
}

export async function recordWalletConnection(address: string): Promise<void> {
  await recordSiteActivity('wallet_connect', address)
}

export async function fetchWalletBalance(token: string): Promise<{ walletAddress: string; sol: number }> {
  const response = await fetch(`${apiBaseUrl}/api/wallet/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await response.json() as { walletAddress?: string; sol?: number; error?: string }
  if (!response.ok || typeof payload.sol !== 'number' || !payload.walletAddress) {
    throw new Error(payload.error || 'Could not load the wallet balance.')
  }
  return { walletAddress: payload.walletAddress, sol: payload.sol }
}

export async function fetchWalletHoldings(token: string): Promise<{ holdings: WalletTokenHolding[]; unavailableChains: string[]; updatedAt: string }> {
  const response = await fetch(`${apiBaseUrl}/api/wallet/holdings`, {
    headers: { Authorization: 'Bearer ' + token },
  })
  const payload = await readApiResponse<{ holdings?: WalletTokenHolding[]; unavailableChains?: string[]; updatedAt?: string; error?: string }>(response, 'Could not load wallet holdings.')
  if (!response.ok) throw new Error(payload.error || 'Could not load wallet holdings.')
  if (!Array.isArray(payload.holdings)) throw new Error('The wallet holdings response was invalid.')
  return {
    holdings: payload.holdings,
    unavailableChains: Array.isArray(payload.unavailableChains) ? payload.unavailableChains : [],
    updatedAt: payload.updatedAt || new Date().toISOString(),
  }
}

export async function fetchSolanaBlockhash(): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/wallet/solana/blockhash`)
  const payload = await response.json() as { blockhash?: string; error?: string }
  if (!response.ok || !payload.blockhash) throw new Error(payload.error || 'Could not prepare a Solana transaction.')
  return payload.blockhash
}

export async function fetchSolanaDonationBalance(address: string): Promise<{ lamports: number; sol: number; feeReserveLamports: number }> {
  const response = await fetch(`${apiBaseUrl}/api/wallet/solana/balance/${encodeURIComponent(address)}`)
  const payload = await response.json() as { lamports?: number; sol?: number; feeReserveLamports?: number; error?: string }
  if (!response.ok || !Number.isSafeInteger(payload.lamports) || typeof payload.sol !== 'number' || !Number.isSafeInteger(payload.feeReserveLamports)) {
    throw new Error(payload.error || 'Could not check the Solana wallet balance.')
  }
  return { lamports: payload.lamports!, sol: payload.sol, feeReserveLamports: payload.feeReserveLamports! }
}

export const sampleCoins: Coin[] = [
  { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', image: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png', price: 0.1642, change24h: 4.82, marketCap: 23_690_000_000, volume: 1_140_000_000, rank: 1 },
  { id: 'shiba-inu', name: 'Shiba Inu', symbol: 'SHIB', image: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png', price: 0.0000241, change24h: -2.14, marketCap: 14_200_000_000, volume: 263_000_000, rank: 2 },
  { id: 'pepe', name: 'Pepe', symbol: 'PEPE', image: 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg', price: 0.0000083, change24h: 12.67, marketCap: 3_490_000_000, volume: 984_000_000, rank: 3 },
  { id: 'dogwifcoin', name: 'dogwifhat', symbol: 'WIF', image: 'https://assets.coingecko.com/coins/images/33566/large/dogwifhat.jpg', price: 2.48, change24h: 8.31, marketCap: 2_480_000_000, volume: 428_000_000, rank: 4 },
  { id: 'bonk', name: 'Bonk', symbol: 'BONK', image: 'https://assets.coingecko.com/coins/images/28600/large/bonk.jpg', price: 0.0000317, change24h: -1.36, marketCap: 2_170_000_000, volume: 173_000_000, rank: 5 },
  { id: 'floki', name: 'FLOKI', symbol: 'FLOKI', image: 'https://assets.coingecko.com/coins/images/16746/large/PNG_image.png', price: 0.000212, change24h: 5.04, marketCap: 2_030_000_000, volume: 94_000_000, rank: 6 },
  { id: 'memecoin', name: 'Memecoin', symbol: 'MEME', image: 'https://assets.coingecko.com/coins/images/32528/large/memecoin.jpg', price: 0.0341, change24h: -4.78, marketCap: 327_000_000, volume: 67_000_000, rank: 7 },
  { id: 'popcat', name: 'Popcat', symbol: 'POPCAT', image: 'https://assets.coingecko.com/coins/images/33760/large/image.jpg', price: 0.627, change24h: 18.32, marketCap: 615_000_000, volume: 121_000_000, rank: 8 },
  { id: 'book-of-meme', name: 'BOOK OF MEME', symbol: 'BOME', image: 'https://assets.coingecko.com/coins/images/36071/large/bome.png', price: 0.0108, change24h: 2.05, marketCap: 744_000_000, volume: 81_000_000, rank: 9 },
  { id: 'mog-coin', name: 'Mog Coin', symbol: 'MOG', image: 'https://assets.coingecko.com/coins/images/30955/large/mog.png', price: 0.0000015, change24h: -3.22, marketCap: 577_000_000, volume: 58_000_000, rank: 10 },
]

export async function fetchMarket(): Promise<Coin[]> {
  const response = await fetch(`${apiBaseUrl}/api/market?limit=50`)
  if (!response.ok) throw new Error('Market data request failed')
  const payload = await response.json() as { coins?: Coin[] }
  if (!Array.isArray(payload.coins) || payload.coins.length === 0) throw new Error('No market data available')
  return payload.coins
}

export async function fetchMarketCoinDetails(id: string, days: number, signal?: AbortSignal): Promise<CoinMarketDetails> {
  const response = await fetch(`${apiBaseUrl}/api/market/coin/${encodeURIComponent(id)}?days=${days}`, { signal })
  const payload = await response.json() as CoinMarketDetails & { error?: string }
  if (!response.ok || !payload.coin || !Array.isArray(payload.points)) throw new Error(payload.error || 'Could not load coin market details.')
  return payload
}
