<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Bell, House } from '@lucide/vue'
import AdsBanner from './components/AdsBanner.vue'
import AdminChatDashboard from './components/AdminChatDashboard.vue'
import AdminContentDashboard from './components/AdminContentDashboard.vue'
import AssistantChat from './components/AssistantChat.vue'
import CoinTable from './components/CoinTable.vue'
import CoinMarketDetail from './components/CoinMarketDetail.vue'
import DonateButton from './components/DonateButton.vue'
import MarketCoinDetail from './components/MarketCoinDetail.vue'
import OwnerDonorDashboard from './components/OwnerDonorDashboard.vue'
import ScanReport from './components/ScanReport.vue'
import TokenLogo from './components/TokenLogo.vue'
import TrendingTable from './components/TrendingTable.vue'
import WalletButton from './components/WalletButton.vue'
import { fetchAdminAccess, fetchContractScan, fetchDonorDashboard, fetchLandingEvents, fetchMarket, fetchSiteTheme, fetchTrackedMarketUpdates, fetchTrendingMemecoins, recordSiteActivity, sampleCoins, type Coin, type ContractScan, type DonorDashboard, type LandingEvent, type SeasonalTheme, type TrendingMemecoin } from './lib/api'
import { formatCurrency } from './lib/currency'

type AppPage = 'landing' | 'scanner' | 'markets' | 'watchlist'
type AdminSection = 'content' | 'donors' | 'chat'
type WalletSession = { address: string; token: string } | null
type WatchlistPriceAlert = {
  id: string
  key: string
  name: string
  changePercent: number
  watchStartedAt: string | null
  createdAt: string
  read: boolean
}
type DonationNotification = {
  id: string
  status: 'submitted' | 'failed'
  chain: string
  symbol: string
  amount: string
  signature?: string
  explorerUrl?: string
  message?: string
  createdAt: string
  read: boolean
}
type FavoritePriceMonitor = {
  watchStartedAt: string
  watchStartPrice: number | null
  lastObservedPrice: number | null
  lastAlertedAt: string | null
}
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const landingSlides = ref<LandingEvent[]>([
  {
    id: 'default-launch-night',
    badge: 'LIVE EVENT',
    title: 'Cobra MemeScope Launch Night',
    description: 'Track the newest pairs, liquidity shifts, and risk signals before the next wave hits.',
    eventDate: 'Nov 14 · 6:30 PM',
    cta: 'Explore market pulse',
    imageUrl: '',
    displayOrder: 0,
  },
  {
    id: 'default-alpha-brief',
    badge: 'COMMUNITY DROP',
    title: 'Solana alpha brief',
    description: 'Fresh token screening, holder risk snapshots, and launch desk intel for active communities.',
    eventDate: 'Nov 18 · 8:00 PM',
    cta: 'Join the briefing',
    imageUrl: '',
    displayOrder: 1,
  },
  {
    id: 'default-contract-masterclass',
    badge: 'RISK REPORT',
    title: 'Contract review masterclass',
    description: 'Learn how to read holder concentration, creator controls, and live liquidity risk at a glance.',
    eventDate: 'Nov 21 · 4:00 PM',
    cta: 'See the event',
    imageUrl: '',
    displayOrder: 2,
  },
])

const ownerWalletAddress = 'J4SBuzguguPJh6uU6SiVPX4qfsUDoDbRcEPXa6R8Jbob'
const seasonalThemeStorageKey = 'memescope-site-seasonal-theme'

function readCachedSiteTheme(): SeasonalTheme {
  try {
    const cachedTheme = localStorage.getItem(seasonalThemeStorageKey)
    if (cachedTheme === 'none' || cachedTheme === 'christmas' || cachedTheme === 'halloween' || cachedTheme === 'new-year') {
      return cachedTheme
    }
  } catch (error) {
    console.warn('Could not read the cached site appearance:', error)
  }
  return 'new-year'
}

function cacheSiteTheme(theme: SeasonalTheme) {
  try {
    localStorage.setItem(seasonalThemeStorageKey, theme)
  } catch (error) {
    console.warn('Could not cache the site appearance in this browser:', error)
  }
}

const seasonalTheme = ref<SeasonalTheme>(readCachedSiteTheme())
const seasonalParticles = Array.from({ length: 26 }, (_, index) => ({
  id: index,
  left: `${(index * 37 + 11) % 100}%`,
  delay: `${-((index * 13) % 20)}s`,
  duration: `${14 + (index * 7) % 15}s`,
  size: `${10 + (index * 5) % 12}px`,
  opacity: 0.3 + (index % 4) * 0.1,
}))
const newYearFireworks = [
  { id: 0, left: '16%', top: '30%', delay: '0s', duration: '8s' },
  { id: 1, left: '37%', top: '18%', delay: '1.5s', duration: '9s' },
  { id: 2, left: '58%', top: '22%', delay: '3s', duration: '8.5s' },
  { id: 3, left: '80%', top: '28%', delay: '2.2s', duration: '10s' },
  { id: 4, left: '69%', top: '44%', delay: '4.1s', duration: '9.5s' },
]
const smallNewYearFireworks = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: `${6 + (index * 16) % 88}%`,
  top: `${12 + (index * 13) % 58}%`,
  delay: `${-((index * 1.3) % 10)}s`,
  duration: `${7 + (index % 5) * 1.3}s`,
}))
const halloweenPumpkins = [
  { id: 0, left: '8%', top: '76%', delay: '-2s', duration: '5.8s' },
  { id: 1, left: '78%', top: '66%', delay: '-4.1s', duration: '6.4s' },
  { id: 2, left: '51%', top: '18%', delay: '-1.3s', duration: '7s' },
]
const halloweenBats = [
  { id: 0, top: '22%', delay: '-3s', duration: '19s' },
  { id: 1, top: '46%', delay: '-12s', duration: '23s' },
  { id: 2, top: '72%', delay: '-7s', duration: '21s' },
]
const halloweenMessageVisible = ref(false)
let halloweenMessageTimer: number | undefined
let siteThemeLoadErrorLogged = false
const trendingFeedCacheStorageKey = 'memescope-trending-feed-cache-v1'
const trendingFeedCacheMaxAgeMs = 6 * 60 * 60 * 1000
const trendingWatchlistStorageKey = 'memescope-trending-watchlist'
const explicitTrendingWatchlistMigrationKey = 'memescope-explicit-trending-watchlist-v1'
const watchlistAlertsStorageKey = 'memescope-watchlist-alerts'
const donationNotificationsStorageKey = 'memescope-donation-notifications'
const notificationSoundStorageKey = 'memescope-notification-sound'
const favoritePriceMonitorsStorageKey = 'memescope-favorite-price-monitors'

function isTrendingMemecoin(value: unknown): value is TrendingMemecoin {
  if (!value || typeof value !== 'object') return false
  const coin = value as Record<string, unknown>
  return typeof coin.address === 'string'
    && typeof coin.chainId === 'string'
    && typeof coin.chain === 'string'
    && typeof coin.name === 'string'
    && typeof coin.symbol === 'string'
    && typeof coin.risk === 'object'
    && coin.risk !== null
}

function readCachedTrendingFeed() {
  try {
    const cached = JSON.parse(localStorage.getItem(trendingFeedCacheStorageKey) || 'null') as {
      coins?: unknown
      updatedAt?: unknown
    } | null
    if (!cached || !Array.isArray(cached.coins) || typeof cached.updatedAt !== 'string') return null
    const updatedAt = new Date(cached.updatedAt)
    if (!Number.isFinite(updatedAt.getTime()) || Date.now() - updatedAt.getTime() > trendingFeedCacheMaxAgeMs) return null
    const coins = cached.coins.filter(isTrendingMemecoin)
    return coins.length ? { coins, updatedAt } : null
  } catch (error) {
    console.warn('Could not read the cached launch feed:', error)
    return null
  }
}

function cacheTrendingFeed(coins: TrendingMemecoin[], updatedAt: string) {
  if (!coins.length) return
  try {
    localStorage.setItem(trendingFeedCacheStorageKey, JSON.stringify({ coins, updatedAt }))
  } catch (error) {
    console.warn('Could not cache the launch feed in this browser:', error)
  }
}

if (localStorage.getItem(explicitTrendingWatchlistMigrationKey) !== 'done') {
  localStorage.removeItem(trendingWatchlistStorageKey)
  localStorage.setItem(explicitTrendingWatchlistMigrationKey, 'done')
}

document.documentElement.dataset.seasonalTheme = seasonalTheme.value

function applySiteTheme(theme: SeasonalTheme) {
  seasonalTheme.value = theme
  document.documentElement.dataset.seasonalTheme = activeSeasonalTheme.value
  cacheSiteTheme(theme)
}

async function loadSiteTheme() {
  try {
    applySiteTheme(await fetchSiteTheme())
    siteThemeLoadErrorLogged = false
  } catch (error) {
    if (!siteThemeLoadErrorLogged) {
      console.error('Could not load the public seasonal theme:', error)
      siteThemeLoadErrorLogged = true
    }
  }
}

function showHalloweenMessage() {
  halloweenMessageVisible.value = true
  if (halloweenMessageTimer !== undefined) window.clearTimeout(halloweenMessageTimer)
  halloweenMessageTimer = window.setTimeout(() => {
    halloweenMessageVisible.value = false
    halloweenMessageTimer = undefined
  }, 3000)
}

function readTrendingWatchlist(): TrendingMemecoin[] {
  try {
    const saved = JSON.parse(localStorage.getItem(trendingWatchlistStorageKey) || '[]') as TrendingMemecoin[]
    return Array.isArray(saved) ? saved.filter((coin) => coin && coin.address && coin.chainId) : []
  } catch {
    return []
  }
}

function readWatchlistAlerts(): WatchlistPriceAlert[] {
  try {
    const saved = JSON.parse(localStorage.getItem(watchlistAlertsStorageKey) || '[]') as WatchlistPriceAlert[]
    return Array.isArray(saved) ? saved.filter((alert) => alert && alert.id && alert.key && Number.isFinite(alert.changePercent)) : []
  } catch {
    return []
  }
}

function readDonationNotifications(): DonationNotification[] {
  try {
    const saved = JSON.parse(localStorage.getItem(donationNotificationsStorageKey) || '[]') as DonationNotification[]
    if (!Array.isArray(saved)) return []
    const normalized: DonationNotification[] = saved.map((notification) => ({ ...notification, status: notification.status || 'submitted' as const }))
    return normalized
      .filter((notification) => notification && notification.chain && notification.symbol && (
        notification.status === 'failed' ? Boolean(notification.message) : Boolean(notification.signature && notification.explorerUrl?.startsWith('https://'))
      ))
  } catch {
    return []
  }
}

function readFavoritePriceMonitors(): Record<string, FavoritePriceMonitor> {
  try {
    const saved = JSON.parse(localStorage.getItem(favoritePriceMonitorsStorageKey) || '{}') as Record<string, FavoritePriceMonitor>
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}

const coins = ref<Coin[]>(sampleCoins)
const loading = ref(true)
const liveData = ref(false)
const query = ref('')
const activePage = ref<AppPage>('landing')
const isAdminPortal = ref(window.location.pathname.replace(/\/+$/, '') === '/admin')
const adminSection = ref<AdminSection>('content')
const currentSlide = ref(0)
const installPrompt = ref<InstallPromptEvent | null>(null)
const installMessage = ref('')
const isAndroidDevice = /android/i.test(navigator.userAgent)
const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isPwaInstalled = ref(false)
const currentAnnouncement = computed(() => landingSlides.value.length
  ? landingSlides.value[currentSlide.value % landingSlides.value.length]
  : null)
const sortKey = ref<'rank' | 'price' | 'change24h' | 'marketCap' | 'volume'>('rank')
const favorites = ref<string[]>(JSON.parse(localStorage.getItem('meme-watchlist') || '[]'))
const updatedAt = ref(new Date())
const scanAddress = ref('')
const scanResult = ref<ContractScan | null>(null)
const assistantScanContext = computed(() => {
  if (!scanResult.value) return ''
  const report = scanResult.value
  return JSON.stringify({
    token: report.token,
    address: report.address,
    chain: report.chain,
    summary: report.summary,
    checkedAt: report.checkedAt,
    market: report.market,
    sources: report.sources,
    checks: report.checks.slice(0, 12).map(({ label, status, value, detail, source }) => ({ label, status, value, detail, source })),
  })
})
const scanLoading = ref(false)
const scanError = ref('')
const cachedTrendingFeed = readCachedTrendingFeed()
const trendingCoins = ref<TrendingMemecoin[]>(cachedTrendingFeed?.coins ?? [])
const liquidityChanges = ref<Record<string, { amount: number; percent: number } | null>>({})
const selectedMarketCoin = ref<TrendingMemecoin | null>(null)
const selectedListedCoin = ref<Coin | null>(null)
const trendingLoading = ref(false)
const trendingError = ref('')
const trendingUpdatedAt = ref(cachedTrendingFeed?.updatedAt ?? new Date())
const trendingSearchQuery = ref('')
const trendingMode = ref<'all' | 'fast' | 'clear' | 'boosted'>('all')
const selectedTrendingChain = ref('all')
const showAllTrending = ref(false)
const notificationsOpen = ref(false)
const watchlistAlerts = ref<WatchlistPriceAlert[]>(readWatchlistAlerts())
const donationNotifications = ref<DonationNotification[]>(readDonationNotifications())
const notificationSoundEnabled = ref(localStorage.getItem(notificationSoundStorageKey) !== 'false')
const favoritePriceMonitors = ref<Record<string, FavoritePriceMonitor>>(readFavoritePriceMonitors())
const notificationNow = ref(Date.now())
let savedMarketsRefreshInProgress = false
const savedTrendingCoins = ref<TrendingMemecoin[]>(readTrendingWatchlist())
const walletSession = ref<WalletSession>(null)
const bannedUser = ref<{ reason: string } | null>(null)
const activeSeasonalTheme = computed<SeasonalTheme>(() => seasonalTheme.value)
const adminRole = ref<'owner' | 'staff' | null>(null)
const adminAccessError = ref('')
const donorDashboard = ref<DonorDashboard | null>(null)
const donorDashboardLoading = ref(false)
const donorDashboardError = ref('')

const visibleCoins = computed(() => {
  const filtered = coins.value.filter((coin) => {
    const matchesQuery = `${coin.name} ${coin.symbol}`.toLowerCase().includes(query.value.toLowerCase())
    return matchesQuery && (activePage.value !== 'watchlist' || favorites.value.includes(coin.id))
  })
  return [...filtered].sort((a, b) => sortKey.value === 'rank' ? a.rank - b.rank : b[sortKey.value] - a[sortKey.value])
})

const marketCapTotal = computed(() => coins.value.reduce((total, coin) => total + coin.marketCap, 0))
const marketVolumeTotal = computed(() => coins.value.reduce((total, coin) => total + coin.volume, 0))
const pageHeading = computed(() => {
  if (activePage.value === 'landing') return 'Home & announcement'
  if (activePage.value === 'scanner') return 'Analyze token'
  if (activePage.value === 'watchlist') return 'Your watchlist'
  return 'New & moving'
})
const isOwnerWallet = computed(() => walletSession.value?.address === ownerWalletAddress)
const savedTrendingKeys = computed(() => savedTrendingCoins.value.map((coin) => `${coin.chainId}:${coin.address}`))
const supportedChainCatalog = [
  { chainId: 'solana', name: 'Solana' },
  { chainId: 'ethereum', name: 'Ethereum' },
  { chainId: 'base', name: 'Base' },
  { chainId: 'bsc', name: 'BNB Chain' },
  { chainId: 'arbitrum', name: 'Arbitrum' },
  { chainId: 'sui', name: 'Sui' },
  { chainId: 'polygon', name: 'Polygon' },
  { chainId: 'avalanche', name: 'Avalanche' },
  { chainId: 'robinhood', name: 'Robinhood' },
] as const

const chainLogoSvgById: Record<string, string> = {
  solana: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="32" height="32" rx="16" fill="#0B0F17"/><path d="M9.5 12.2c.8-.7 2-.7 2.8 0l2.2 2.3c.4.4 1 .4 1.4 0l2-2c.8-.8 2-.8 2.8 0l1 .9c.8.8.8 2.1 0 2.9l-2.1 2.1c-.4.4-.4 1 0 1.4l2.1 2.2c.8.8.8 2.1 0 2.9l-1 .9c-.8.8-2 .8-2.8 0l-2.1-2.1c-.4-.4-1-.4-1.4 0l-2.3 2.3c-.8.8-2 .8-2.8 0l-1-.9c-.8-.8-.8-2.1 0-2.9l2.2-2.2c.4-.4.4-1 0-1.4L7.6 16c-.8-.8-.8-2.1 0-2.9l1-.9Z" fill="url(#solana-a)"/><defs><linearGradient id="solana-a" x1="7" x2="25" y1="8" y2="24"><stop stop-color="#00F5A0"/><stop offset=".52" stop-color="#7C6DFF"/><stop offset="1" stop-color="#4CB8FF"/></linearGradient></defs></svg>`,
  ethereum: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16 3.5 24.8 16.7 16 20.8 7.2 16.7 16 3.5Zm0 24.5 8.8-5.1-8.8 12.1-8.8-12.1 8.8 5.1Zm-8.8-7.9 8.8 5.1 8.8-5.1-8.8 12.1L7.2 20.1Z" fill="#627EEA"/><path d="M16 11.5v9.7l7.3-4.3-7.3-5.4Zm0 0-7.3 5.4 7.3 4.3V11.5Z" fill="#BDC8FF" fill-opacity=".8"/><path d="M16 11.5 23.4 16.9 16 20.8 8.6 16.9 16 11.5Z" fill="#8FA3FF"/></svg>`,
  base: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16 3.5c7 0 12.5 5.5 12.5 12.5S23 28.5 16 28.5 3.5 23 3.5 16 9 3.5 16 3.5Z" fill="#1B3D71"/><path d="M8 16.2c0-4.8 3.7-8.7 8.3-8.7 4.1 0 7.3 2.8 8.1 6.5H16.3a1.8 1.8 0 0 0-1.8 1.8v2.2a1.8 1.8 0 0 0 1.8 1.8h7.8c-.9 3.7-4.1 6.5-8.2 6.5-4.7 0-8.5-3.9-8.5-8.7Z" fill="#0052FF"/><path d="M10.4 12.8h9.7c.9 0 1.6.7 1.6 1.6v1.4c0 .9-.7 1.7-1.6 1.7H10.4c-.9 0-1.7-.8-1.7-1.7v-1.4c0-.9.8-1.6 1.7-1.6Z" fill="#fff" opacity=".9"/></svg>`,
  bsc: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="16" cy="16" r="15.5" fill="#F3BA2F"/><path d="M19.5 9.2 16 5.7l-3.5 3.5-2.1-2.1-2.1 2.1 2.1 2.2L8.3 16l2.1 2.1-2.1 2.1 2.1 2.1 2.1-2.1L16 23.7l3.5-3.5 2.1 2.1 2.1-2.1-2.1-2.1 2.1-2.1-2.1-2.1-2.2 2.2L19.5 9.2Zm-3.5 5.6 2.1 2.1-2.1 2.1-2.1-2.1 2.1-2.1Zm-2.1-2.1 2.1-2.1 2.1 2.1-2.1 2.1-2.1-2.1Z" fill="#fff"/><path d="M16 13.8 13.7 16l2.3 2.2 2.3-2.2-2.3-2.2Z" fill="#F3BA2F"/></svg>`,
  arbitrum: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16 3.5c7.1 0 12.5 5.4 12.5 12.5S23.1 28.5 16 28.5 3.5 23.1 3.5 16 8.9 3.5 16 3.5Z" fill="#0F172A"/><path d="M8.5 22.5V9.5h3.2l5.3 8.1v-8.1h3.2v13H17l-5.3-8.2v8.2H8.5Z" fill="#12A7FF"/><path d="M19.8 9.5h3.2v13h-3.2V9.5Z" fill="#7DD3FC"/></svg>`,
  sui: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="16" cy="16" r="15.5" fill="#6FBCF0"/><path d="M16 5.5c-2.4 3.4-7.2 8.2-7.2 13.1a7.2 7.2 0 0 0 14.4 0c0-4.9-4.8-9.7-7.2-13.1Zm0 18.2a5.1 5.1 0 0 1-5.1-5.1c0-2.6 2.3-5.8 5.1-9.3 2.8 3.5 5.1 6.7 5.1 9.3a5.1 5.1 0 0 1-5.1 5.1Z" fill="#fff"/><path d="M12.1 18.9a3.9 3.9 0 0 0 3.9 3.1" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="1.5"/></svg>`,
  polygon: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#4A1D9E"/><path d="M16 5.5 23.8 10v12L16 26.5 8.2 22V10L16 5.5Zm0 4.1L10.8 11.7v8.6L16 24.5l5.2-4.2v-8.6L16 9.6Zm-2.7 3.5h5.4l2.7 4.7-2.7 4.7h-5.4l-2.7-4.7 2.7-4.7Z" fill="#fff"/><path d="M16 9.6v12.9" stroke="#7C3AED" stroke-width="1.4"/></svg>`,
  avalanche: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="16" cy="16" r="15.5" fill="#E84142"/><path d="M16 6.4 22.7 22h-4.1l-1.6-3.1h-2l-1.5 3.1H9.3L16 6.4Zm-5.7 12.2h11.4l-5.7-11-5.7 11Z" fill="#fff"/><path d="M12.8 21.1h6.4L16 24.7l-3.2-3.6Z" fill="#F7D7D7"/></svg>`,
  robinhood: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="16" cy="16" r="15.5" fill="#00C805"/><path d="M21.8 7.2c-6-.5-11.1 2.6-11.8 7.3-.3 1.9.4 3.5 1.7 4.5l-3.2 3.2 1.5 1.5 3.2-3.2c1.6.7 3.4.4 4.9-.8 3.9-3 5.1-7.7 3.7-12.5Zm-5 10.9c-.8.6-1.7.8-2.5.5l7-7c.1 2.5-1.1 4.9-4.5 6.5Z" fill="#fff"/></svg>`,
}

const supportedChains = computed(() => {
  const counts = new Map<string, number>()
  for (const coin of trendingCoins.value) {
    const chainKey = coin.chainId || coin.chain.toLowerCase().replace(/\s+/g, '-')
    counts.set(chainKey, (counts.get(chainKey) ?? 0) + 1)
  }

  const chains = new Map<string, { chainId: string; name: string }>(
    supportedChainCatalog.map((chain) => [chain.chainId, { chainId: chain.chainId, name: chain.name }]),
  )
  for (const coin of trendingCoins.value) {
    if (!chains.has(coin.chainId)) chains.set(coin.chainId, { chainId: coin.chainId, name: coin.chain })
  }

  return [...chains.values()].map((chain) => ({
    ...chain,
    count: counts.get(chain.chainId) ?? 0,
    logoSvg: chainLogoSvgById[chain.chainId] ?? '<span class="chain-dot"></span>',
  }))
})
const chainFilteredTrendingCoins = computed(() => selectedTrendingChain.value === 'all'
  ? trendingCoins.value
  : trendingCoins.value.filter((coin) => coin.chainId === selectedTrendingChain.value))
const visibleSavedTrendingCoins = computed(() => savedTrendingCoins.value.filter((coin) => `${coin.name} ${coin.symbol} ${coin.address}`.toLowerCase().includes(query.value.toLowerCase())))
const savedTrendingLiquidity = computed(() => savedTrendingCoins.value.reduce((total, coin) => total + coin.liquidityUsd, 0))
const savedTrendingVolume = computed(() => savedTrendingCoins.value.reduce((total, coin) => total + coin.volume24h, 0))
const visibleTrendingCoins = computed(() => {
  const search = trendingSearchQuery.value.trim().toLowerCase()
  const matchingCoins = chainFilteredTrendingCoins.value.filter((coin) => (
    !search || `${coin.name} ${coin.symbol} ${coin.address}`.toLowerCase().includes(search)
  ))
  if (trendingMode.value === 'fast') return matchingCoins.filter((coin) => coin.momentumLabel === 'FAST GROWER')
  if (trendingMode.value === 'clear') return matchingCoins.filter((coin) => coin.risk.level === 'clear')
  if (trendingMode.value === 'boosted') return matchingCoins.filter((coin) => coin.promoted)
  return matchingCoins
})
const displayedTrendingCoins = computed(() => visibleTrendingCoins.value.slice(0, showAllTrending.value ? 50 : 20))
const remainingTrendingCount = computed(() => Math.max(0, visibleTrendingCoins.value.length - displayedTrendingCoins.value.length))
const unreadNotificationCount = computed(() => watchlistAlerts.value.filter((alert) => !alert.read).length + donationNotifications.value.filter((notification) => !notification.read).length)
const tickerTrendingCoins = computed(() => [...trendingCoins.value].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)))
const totalTrendingLiquidity = computed(() => trendingCoins.value.reduce((total, coin) => total + coin.liquidityUsd, 0))
const totalTrendingVolume = computed(() => trendingCoins.value.reduce((total, coin) => total + coin.volume24h, 0))
const fastGrowerCount = computed(() => trendingCoins.value.filter((coin) => coin.momentumLabel === 'FAST GROWER').length)
const boostedCoinCount = computed(() => trendingCoins.value.filter((coin) => coin.promoted).length)

function saveFavoritePriceMonitors() {
  localStorage.setItem(favoritePriceMonitorsStorageKey, JSON.stringify(favoritePriceMonitors.value))
}

function addPriceAlert(key: string, name: string, changePercent: number, watchStartedAt: string) {
  if (Math.abs(changePercent) < 0.1) return
  watchlistAlerts.value.unshift({
    id: `${key}:${Date.now()}`,
    key,
    name,
    changePercent,
    watchStartedAt,
    createdAt: new Date().toISOString(),
    read: false,
  })
  watchlistAlerts.value = watchlistAlerts.value.slice(0, 50)
  saveWatchlistAlerts()
  playWatchlistChime()
}

function trackingDuration(startedAt: string) {
  const elapsedMinutes = Math.max(1, Math.floor((notificationNow.value - new Date(startedAt).getTime()) / 60_000))
  if (elapsedMinutes < 60) return `${elapsedMinutes} ${elapsedMinutes === 1 ? 'minute' : 'minutes'}`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours} ${elapsedHours === 1 ? 'hour' : 'hours'}`
  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 7) return `${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'}`
  const elapsedWeeks = Math.floor(elapsedDays / 7)
  return `${elapsedWeeks} ${elapsedWeeks === 1 ? 'week' : 'weeks'}`
}

function removeCoinAlerts(key: string) {
  watchlistAlerts.value = watchlistAlerts.value.filter((alert) => alert.key !== key)
  saveWatchlistAlerts()
}

function monitorFavoritePrices() {
  if (!liveData.value) return
  const now = Date.now()
  let monitorsChanged = false
  for (const id of favorites.value) {
    const coin = coins.value.find((item) => item.id === id)
    if (!coin || !Number.isFinite(coin.price) || coin.price <= 0) continue
    const existing = favoritePriceMonitors.value[id]
    if (!existing) {
      favoritePriceMonitors.value[id] = { watchStartedAt: new Date(now).toISOString(), watchStartPrice: coin.price, lastObservedPrice: coin.price, lastAlertedAt: null }
      monitorsChanged = true
      continue
    }
    const startPrice = existing.watchStartPrice ?? coin.price
    const previousPrice = existing.lastObservedPrice ?? coin.price
    const moveSinceQuote = previousPrice > 0 ? ((coin.price - previousPrice) / previousPrice) * 100 : 0
    const lastAlertAt = existing.lastAlertedAt ? new Date(existing.lastAlertedAt).getTime() : 0
    if (Math.abs(moveSinceQuote) >= 0.1 && now - lastAlertAt >= 30_000) {
      addPriceAlert(`favorite:${id}`, coin.name, ((coin.price - startPrice) / startPrice) * 100, existing.watchStartedAt)
      existing.lastAlertedAt = new Date(now).toISOString()
    }
    existing.watchStartPrice = startPrice
    existing.lastObservedPrice = coin.price
    favoritePriceMonitors.value[id] = existing
    monitorsChanged = true
  }
  if (monitorsChanged) saveFavoritePriceMonitors()
}

function toggleFavorite(id: string) {
  const isSaved = favorites.value.includes(id)
  favorites.value = isSaved ? favorites.value.filter((favorite) => favorite !== id) : [...favorites.value, id]
  if (isSaved) {
    delete favoritePriceMonitors.value[id]
    removeCoinAlerts(`favorite:${id}`)
    saveFavoritePriceMonitors()
  } else {
    primeNotificationAudio()
    const coin = coins.value.find((item) => item.id === id)
    favoritePriceMonitors.value[id] = {
      watchStartedAt: new Date().toISOString(),
      watchStartPrice: liveData.value && coin ? coin.price : null,
      lastObservedPrice: liveData.value && coin ? coin.price : null,
      lastAlertedAt: null,
    }
    saveFavoritePriceMonitors()
    void recordSiteActivity('token_track')
  }
  localStorage.setItem('meme-watchlist', JSON.stringify(favorites.value))
}

async function loadMarket() {
  if (marketRefreshInProgress) return
  marketRefreshInProgress = true
  loading.value = true
  try {
    coins.value = await fetchMarket()
    liveData.value = true
    updatedAt.value = new Date()
    monitorFavoritePrices()
  } catch {
    coins.value = sampleCoins
    liveData.value = false
  } finally {
    loading.value = false
    marketRefreshInProgress = false
  }
}

async function loadTrending() {
  if (trendingLoading.value) return
  trendingLoading.value = true
  trendingError.value = ''
  try {
    const result = await fetchTrendingMemecoins()
    const previousLiquidity = new Map(trendingCoins.value.map((coin) => [`${coin.chainId}:${coin.address}`, coin.liquidityUsd]))
    liquidityChanges.value = Object.fromEntries(result.coins.map((coin) => {
      const previous = previousLiquidity.get(`${coin.chainId}:${coin.address}`)
      const amount = previous === undefined ? null : coin.liquidityUsd - previous
      return [`${coin.chainId}:${coin.address}`, amount === null || previous === undefined || previous <= 0
        ? null
        : { amount, percent: amount / previous * 100 }]
    }))
    trendingCoins.value = result.coins
    trendingUpdatedAt.value = new Date(result.updatedAt)
    cacheTrendingFeed(result.coins, result.updatedAt)
    if (result.stale) {
      trendingError.value = 'The live feed is temporarily unavailable. Showing the last successful market update.'
    }
  } catch (error) {
    trendingError.value = error instanceof Error ? error.message : 'Could not load recent launches.'
  } finally {
    trendingLoading.value = false
  }
  void refreshSavedTrendingMarkets()
}

async function loadLandingEvents() {
  try {
    landingSlides.value = await fetchLandingEvents()
    currentSlide.value = 0
  } catch {
    // Keep the built-in event cards available when the database is offline.
  }
}

function saveTrendingWatchlist() {
  localStorage.setItem(trendingWatchlistStorageKey, JSON.stringify(savedTrendingCoins.value))
}

function saveWatchlistAlerts() {
  localStorage.setItem(watchlistAlertsStorageKey, JSON.stringify(watchlistAlerts.value))
}

function saveDonationNotifications() {
  localStorage.setItem(donationNotificationsStorageKey, JSON.stringify(donationNotifications.value))
}

function recordDonationNotification(receipt: Omit<DonationNotification, 'id' | 'read' | 'status'>) {
  donationNotifications.value = [
    { ...receipt, id: `${receipt.chain}:${receipt.signature}`, status: 'submitted' as const, read: false },
    ...donationNotifications.value.filter((notification) => notification.chain !== receipt.chain || notification.signature !== receipt.signature),
  ].slice(0, 50)
  saveDonationNotifications()
}

function recordDonationFailure(failure: Omit<DonationNotification, 'id' | 'read' | 'status' | 'signature' | 'explorerUrl'>) {
  const id = `${failure.chain}:failed:${failure.createdAt}`
  donationNotifications.value = [
    { ...failure, id, status: 'failed' as const, read: false },
    ...donationNotifications.value.filter((notification) => notification.id !== id),
  ].slice(0, 50)
  saveDonationNotifications()
}

function markDonationNotificationRead(notification: DonationNotification) {
  notification.read = true
  saveDonationNotifications()
}

function removeDonationNotification(id: string) {
  donationNotifications.value = donationNotifications.value.filter((notification) => notification.id !== id)
  saveDonationNotifications()
}

let notificationAudioContext: AudioContext | null = null

function primeNotificationAudio() {
  if (!notificationSoundEnabled.value || typeof window.AudioContext === 'undefined') return
  notificationAudioContext ||= new window.AudioContext()
  if (notificationAudioContext.state === 'suspended') void notificationAudioContext.resume()
}

function playWatchlistChime() {
  if (!notificationSoundEnabled.value || !notificationAudioContext || notificationAudioContext.state !== 'running') return
  const startAt = notificationAudioContext.currentTime
  for (const [index, frequency] of [740, 988].entries()) {
    const oscillator = notificationAudioContext.createOscillator()
    const gain = notificationAudioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, startAt + index * 0.12)
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + index * 0.12 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + index * 0.12 + 0.18)
    oscillator.connect(gain)
    gain.connect(notificationAudioContext.destination)
    oscillator.start(startAt + index * 0.12)
    oscillator.stop(startAt + index * 0.12 + 0.19)
  }
}

function setNotificationSound(enabled: boolean) {
  notificationSoundEnabled.value = enabled
  localStorage.setItem(notificationSoundStorageKey, String(enabled))
  if (enabled) primeNotificationAudio()
}

function removeWatchlistAlert(id: string) {
  watchlistAlerts.value = watchlistAlerts.value.filter((alert) => alert.id !== id)
  saveWatchlistAlerts()
}

function clearNotifications() {
  watchlistAlerts.value = []
  donationNotifications.value = []
  saveWatchlistAlerts()
  saveDonationNotifications()
}

function openWatchlistAlert(alert: WatchlistPriceAlert) {
  alert.read = true
  saveWatchlistAlerts()
  notificationsOpen.value = false
  query.value = alert.name
  activePage.value = 'watchlist'
}

function toggleTrendingWatchlist(coin: TrendingMemecoin) {
  const key = `${coin.chainId}:${coin.address}`
  const existingIndex = savedTrendingCoins.value.findIndex((savedCoin) => `${savedCoin.chainId}:${savedCoin.address}` === key)
  if (existingIndex >= 0) {
    savedTrendingCoins.value.splice(existingIndex, 1)
    removeCoinAlerts(`trending:${key}`)
    removeCoinAlerts(key)
  }
  else {
    primeNotificationAudio()
    savedTrendingCoins.value.unshift({
      ...coin,
      marketStatus: 'LIVE',
      marketUpdatedAt: new Date().toISOString(),
      watchStartedAt: new Date().toISOString(),
      watchStartPriceUsd: coin.priceUsd,
      lastObservedPriceUsd: coin.priceUsd,
      lastPriceAlertPercent: undefined,
      lastPriceAlertAt: undefined,
    })
    void recordSiteActivity('token_track')
  }
  saveTrendingWatchlist()
  if (existingIndex < 0) void refreshSavedTrendingMarkets()
}

async function refreshSavedTrendingMarkets() {
  if (!savedTrendingCoins.value.length || savedMarketsRefreshInProgress) return
  savedMarketsRefreshInProgress = true
  try {
    const updates = await fetchTrackedMarketUpdates(savedTrendingCoins.value.map(({ chainId, address }) => ({ chainId, address })))
    const updateByKey = new Map(updates.map((update) => [`${update.chainId}:${update.address}`, update]))
    savedTrendingCoins.value = savedTrendingCoins.value.map((coin) => {
      const key = `${coin.chainId}:${coin.address}`
      const update = updateByKey.get(key)
      if (!update) return coin
      if (update.marketStatus === 'UNAVAILABLE') return { ...coin, marketStatus: update.marketStatus, momentumLabel: 'MARKET DATA UNAVAILABLE' }

      const change24h = update.change24h ?? coin.change24h
      const priceUsd = update.priceUsd ?? coin.priceUsd
      const watchStartedAt = coin.watchStartedAt || new Date().toISOString()
      const watchStartPriceUsd = coin.watchStartPriceUsd ?? priceUsd
      let lastObservedPriceUsd = coin.lastObservedPriceUsd ?? watchStartPriceUsd
      let lastPriceAlertPercent = coin.lastPriceAlertPercent
      let lastPriceAlertAt = coin.lastPriceAlertAt
      if (priceUsd !== null && priceUsd > 0 && watchStartPriceUsd !== null && watchStartPriceUsd > 0) {
        const changeSinceAdded = ((priceUsd - watchStartPriceUsd) / watchStartPriceUsd) * 100
        const moveSinceQuote = lastObservedPriceUsd && lastObservedPriceUsd > 0
          ? ((priceUsd - lastObservedPriceUsd) / lastObservedPriceUsd) * 100
          : 0
        const lastAlertTime = lastPriceAlertAt ? new Date(lastPriceAlertAt).getTime() : 0
        if (Math.abs(moveSinceQuote) >= 0.1 && Date.now() - lastAlertTime >= 30_000) {
          addPriceAlert(`trending:${key}`, coin.name, changeSinceAdded, watchStartedAt)
          lastPriceAlertPercent = changeSinceAdded
          lastPriceAlertAt = new Date().toISOString()
        }
      }
      lastObservedPriceUsd = priceUsd ?? lastObservedPriceUsd
      const trades = (update.buys24h ?? coin.buys24h) + (update.sells24h ?? coin.sells24h)
      const momentumLabel = update.marketStatus === 'BEARISH'
        ? 'BEARISH · DUMPED'
        : change24h >= 20 ? 'FAST GROWER' : trades >= 150 ? 'HIGH ACTIVITY' : 'TRACKED'
      return {
        ...coin,
        ...update,
        priceUsd,
        change24h,
        liquidityUsd: update.liquidityUsd ?? coin.liquidityUsd,
        volume24h: update.volume24h ?? coin.volume24h,
        buys24h: update.buys24h ?? coin.buys24h,
        sells24h: update.sells24h ?? coin.sells24h,
        pairUrl: update.pairUrl || coin.pairUrl,
        dex: update.dex || coin.dex,
        name: coin.name,
        symbol: coin.symbol,
        image: coin.image,
        risk: coin.risk,
        momentumScore: coin.momentumScore,
        momentumLabel,
        watchStartedAt,
        watchStartPriceUsd,
        lastObservedPriceUsd,
        lastPriceAlertPercent,
        lastPriceAlertAt,
      }
    })
    saveTrendingWatchlist()
  } catch {
    savedTrendingCoins.value = savedTrendingCoins.value.map((coin) => ({ ...coin, marketStatus: 'STALE', momentumLabel: 'STALE · LAST KNOWN' }))
  } finally {
    savedMarketsRefreshInProgress = false
  }
}

async function loadDonorDashboard() {
  const token = walletSession.value?.token
  if (!isOwnerWallet.value || !token) return
  donorDashboardLoading.value = true
  donorDashboardError.value = ''
  try {
    donorDashboard.value = await fetchDonorDashboard(token)
  } catch (error) {
    donorDashboardError.value = error instanceof Error ? error.message : 'Could not load donor activity.'
  } finally {
    donorDashboardLoading.value = false
  }
}

function goToScanner() {
  activePage.value = 'scanner'
  scanAddress.value = ''
  scanResult.value = null
  scanError.value = ''
}

function navigateToLanding() {
  activePage.value = 'landing'
  notificationsOpen.value = false
  selectedMarketCoin.value = null
  selectedListedCoin.value = null
  document.getElementById('top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function openDonorDashboard() {
  if (!isOwnerWallet.value) return
  adminSection.value = 'donors'
  void loadDonorDashboard()
}

function navigateToAdminPortal() {
  if (!isAdminPortal.value) window.history.pushState({}, '', '/admin')
  isAdminPortal.value = true
}

function navigateToPublicSite() {
  if (isAdminPortal.value) window.history.pushState({}, '', '/')
  isAdminPortal.value = false
  activePage.value = 'landing'
}

function handleHistoryNavigation() {
  isAdminPortal.value = window.location.pathname.replace(/\/+$/, '') === '/admin'
  if (!isAdminPortal.value) activePage.value = 'landing'
  else if (adminRole.value) adminSection.value = 'content'
}

async function loadAdminAccess(session: Exclude<WalletSession, null>) {
  adminAccessError.value = ''
  try {
    const access = await fetchAdminAccess(session.token)
    if (walletSession.value?.token !== session.token) return
    adminRole.value = access.role
    if (access.role !== 'owner' && adminSection.value === 'donors') adminSection.value = 'content'
    navigateToAdminPortal()
  } catch {
    if (walletSession.value?.token !== session.token) return
    adminRole.value = null
    adminAccessError.value = 'This wallet is not authorized for the private admin portal.'
  }
}

function handleWalletSession(session: WalletSession) {
  walletSession.value = session
  document.documentElement.dataset.seasonalTheme = seasonalTheme.value
  adminRole.value = null
  adminAccessError.value = ''
  if (!session) {
    halloweenMessageVisible.value = false
    donorDashboard.value = null
    return
  }
  void loadAdminAccess(session)
}

function handleWalletBanned(reason: string) {
  bannedUser.value = { reason: reason || 'This account is banned.' }
  walletSession.value = null
  adminRole.value = null
  adminAccessError.value = ''
  donorDashboard.value = null
  if (isAdminPortal.value) navigateToPublicSite()
}

function handleWalletSignedOut() {
  bannedUser.value = null
  if (isAdminPortal.value) navigateToPublicSite()
}

function handleBannedSignOut() {
  const sessionKeys = ['memescope-wallet-token', 'memescope-wallet-address', 'memescope-wallet-metadata', 'memescope-pending-invite-code']
  for (const key of sessionKeys) {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  }
  bannedUser.value = null
  walletSession.value = null
  adminRole.value = null
  adminAccessError.value = ''
  donorDashboard.value = null
  if (isAdminPortal.value) navigateToPublicSite()
}

function handleAccountDeleted() {
  favorites.value = []
  savedTrendingCoins.value = []
  watchlistAlerts.value = []
  donationNotifications.value = []
  favoritePriceMonitors.value = {}
  notificationSoundEnabled.value = true
  notificationsOpen.value = false
  for (const key of [
    'meme-watchlist',
    trendingWatchlistStorageKey,
    watchlistAlertsStorageKey,
    donationNotificationsStorageKey,
    favoritePriceMonitorsStorageKey,
    notificationSoundStorageKey,
  ]) {
    localStorage.removeItem(key)
  }
}

function scanTrendingCoin(address: string) {
  activePage.value = 'scanner'
  scanAddress.value = address
  void runScan()
}

function selectMarketCoin(coin: TrendingMemecoin) {
  selectedMarketCoin.value = coin
}

async function runScan() {
  const address = scanAddress.value.trim()
  if (!address) {
    scanError.value = 'Paste a Solana mint or EVM contract address to begin.'
    return
  }

  scanLoading.value = true
  scanError.value = ''
  scanResult.value = null
  try {
    scanResult.value = await fetchContractScan(address)
    void recordSiteActivity('contract_scan')
  } catch (error) {
    scanError.value = error instanceof Error ? error.message : 'The scan could not be completed.'
  } finally {
    scanLoading.value = false
  }
}

let refreshTimer: number | undefined
let siteThemeTimer: number | undefined
let landingSlideTimer: number | undefined
let ownerDashboardTimer: number | undefined
let watchlistPriceTimer: number | undefined
let favoritePriceTimer: number | undefined
let notificationClockTimer: number | undefined
let marketRefreshInProgress = false

function captureInstallPrompt(event: Event) {
  event.preventDefault()
  installPrompt.value = event as InstallPromptEvent
}

function markPwaInstalled() {
  isPwaInstalled.value = true
  installPrompt.value = null
  installMessage.value = 'Cobra MemeScope is installed and ready on this device.'
}

async function installMemeScopeApp() {
  installMessage.value = ''
  if (isPwaInstalled.value) {
    installMessage.value = 'Cobra MemeScope is already installed on this device.'
    return
  }

  if (!installPrompt.value) {
    installMessage.value = isIosDevice
      ? 'In Safari, tap Share, then choose “Add to Home Screen.”'
      : isAndroidDevice
        ? 'In Chrome, open the ⋮ menu and choose “Install app” or “Add to Home screen.”'
        : 'Use your browser’s install icon or menu to add Cobra MemeScope to your device.'
    return
  }

  try {
    const prompt = installPrompt.value
    await prompt.prompt()
    const choice = await prompt.userChoice
    installPrompt.value = null
    installMessage.value = choice.outcome === 'accepted'
      ? 'Installation started. Follow the confirmation on your device.'
      : 'Installation was cancelled. You can install later from Chrome’s menu.'
  } catch (error) {
    console.error('Cobra MemeScope install prompt failed:', error)
    installMessage.value = 'The install prompt could not open. Use Chrome’s ⋮ menu and choose “Install app.”'
  }
}

onMounted(() => {
  window.addEventListener('popstate', handleHistoryNavigation)
  window.addEventListener('beforeinstallprompt', captureInstallPrompt)
  window.addEventListener('appinstalled', markPwaInstalled)
  isPwaInstalled.value = window.matchMedia('(display-mode: standalone)').matches
  void recordSiteActivity('site_visit')
  void loadSiteTheme()
  void loadLandingEvents()
  void loadMarket()
  void loadTrending()
  void refreshSavedTrendingMarkets()
  refreshTimer = window.setInterval(() => {
    void loadLandingEvents()
    void loadTrending()
  }, 60_000)
  siteThemeTimer = window.setInterval(() => { void loadSiteTheme() }, 15_000)

  landingSlideTimer = window.setInterval(() => {
    currentSlide.value = landingSlides.value.length
      ? (currentSlide.value + 1) % landingSlides.value.length
      : 0
  }, 4000)
  ownerDashboardTimer = window.setInterval(() => {
    if (isAdminPortal.value && adminSection.value === 'donors' && isOwnerWallet.value) void loadDonorDashboard()
  }, 30_000)
  watchlistPriceTimer = window.setInterval(() => {
    if (savedTrendingCoins.value.length) void refreshSavedTrendingMarkets()
  }, 30_000)
  favoritePriceTimer = window.setInterval(() => {
    if (favorites.value.length) void loadMarket()
  }, 30_000)
  notificationClockTimer = window.setInterval(() => { notificationNow.value = Date.now() }, 60_000)
})

onUnmounted(() => {
  window.removeEventListener('popstate', handleHistoryNavigation)
  window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
  window.removeEventListener('appinstalled', markPwaInstalled)
  window.clearInterval(refreshTimer)
  window.clearInterval(siteThemeTimer)
  window.clearInterval(landingSlideTimer)
  window.clearInterval(ownerDashboardTimer)
  window.clearInterval(watchlistPriceTimer)
  window.clearInterval(favoritePriceTimer)
  window.clearInterval(notificationClockTimer)
  if (halloweenMessageTimer !== undefined) window.clearTimeout(halloweenMessageTimer)
})
</script>

<template>
  <div v-if="isAdminPortal" class="admin-portal-shell">
    <header class="admin-portal-topbar">
      <button type="button" class="admin-portal-brand" @click="navigateToPublicSite"><img class="scanner-brand-mark" src="/mascot-profile.png" alt="" /><span>COBRA <span>MEMESCOPE</span></span></button>
      <div class="admin-portal-label"><span></span> PRIVATE ADMIN PORTAL <b>/</b> {{ adminRole ? adminRole.toUpperCase() : 'WALLET ACCESS REQUIRED' }}</div>
      <div class="admin-portal-actions">
        <WalletButton @wallet-session="handleWalletSession" @wallet-signed-out="handleWalletSignedOut" @wallet-banned="handleWalletBanned" />
      </div>
    </header>
    <main class="admin-portal-main">
      <section v-if="adminRole && walletSession" class="admin-portal-workspace">
        <nav class="admin-portal-tabs" aria-label="Admin sections">
          <button type="button" :class="{ active: adminSection === 'content' }" @click="adminSection = 'content'">Site content</button>
          <button v-if="adminRole === 'owner'" type="button" :class="{ active: adminSection === 'donors' }" @click="adminSection = 'donors'; void loadDonorDashboard()">Donor activity</button>
          <button type="button" :class="{ active: adminSection === 'chat' }" @click="adminSection = 'chat'">Admin chat</button>
        </nav>
        <AdminContentDashboard v-if="adminSection === 'content'" :token="walletSession.token" :role="adminRole" @theme-updated="applySiteTheme" />
        <AdminChatDashboard v-else-if="adminSection === 'chat'" :token="walletSession.token" :wallet-address="walletSession.address" :role="adminRole" />
        <OwnerDonorDashboard v-else-if="adminRole === 'owner'" :dashboard="donorDashboard" :loading="donorDashboardLoading" :error="donorDashboardError" @refresh="loadDonorDashboard" />
      </section>
      <section v-else class="admin-portal-gate">
        <div class="admin-portal-gate-mark">M<span>/</span></div>
        <div class="admin-portal-label"><span></span> COBRA MEMESCOPE ACCESS CONTROL</div>
        <h1>{{ walletSession ? 'Access not granted' : 'Private workspace' }}<em>.</em></h1>
        <p>{{ walletSession ? adminAccessError || 'This wallet is not on the owner or staff allowlist.' : 'Connect and sign in with an approved Solana wallet to continue to the admin dashboard.' }}</p>
        <button type="button" class="admin-portal-back" @click="navigateToPublicSite">RETURN TO PUBLIC SITE <span>↗</span></button>
      </section>
    </main>
  </div>

  <div v-else class="scanner-shell" :data-seasonal-theme="activeSeasonalTheme">
    <div v-if="activeSeasonalTheme !== 'none'" class="seasonal-effects">
      <template v-if="activeSeasonalTheme === 'new-year'">
        <span
          v-for="firework in smallNewYearFireworks"
          :key="`small-${firework.id}`"
          class="seasonal-firework seasonal-firework-small"
          aria-hidden="true"
          :style="{ left: firework.left, top: firework.top }"
        ><i v-for="spark in 12" :key="spark" :style="{ '--spark-angle': `${(spark - 1) * 30}deg`, animationDelay: firework.delay, animationDuration: firework.duration }"></i></span>
        <span
          v-for="firework in newYearFireworks"
          :key="firework.id"
          class="seasonal-firework"
          aria-hidden="true"
          :style="{ left: firework.left, top: firework.top }"
        ><i v-for="spark in 24" :key="spark" :style="{ '--spark-angle': `${(spark - 1) * 15}deg`, animationDelay: firework.delay, animationDuration: firework.duration }"></i></span>
      </template>
      <template v-else-if="activeSeasonalTheme === 'halloween'">
        <button
          v-for="pumpkin in halloweenPumpkins"
          :key="`pumpkin-${pumpkin.id}`"
          type="button"
          class="seasonal-pumpkin"
          aria-label="Click pumpkin for a Halloween greeting"
          :style="{ left: pumpkin.left, top: pumpkin.top, animationDelay: pumpkin.delay, animationDuration: pumpkin.duration }"
          @click="showHalloweenMessage"
        >
          <svg class="pumpkin-art" viewBox="0 0 48 48" aria-hidden="true">
            <path d="M21 12c-1-4 1-7 5-9 1 4 0 7-2 9" fill="#668b35" />
            <path d="M23 12c-5-4-10-2-13 1-5-1-8 4-8 12 0 10 6 17 13 17 3 3 9 3 12 0 8 1 14-6 14-17 0-8-4-13-9-12-4-3-7-3-9-1Z" fill="#ff8b3d" stroke="#ffbd69" stroke-width="1.5" />
            <path d="M10 16c-2 7-2 15 1 20m9-23c-2 8-2 16 0 22m9-22c2 8 2 16 0 22m9-19c2 7 1 14-2 19" fill="none" stroke="#d65b2a" stroke-linecap="round" stroke-width="2" opacity=".72" />
            <path d="m12 22 7 2-5 6Zm24 0-7 2 5 6Z" fill="#34243c" />
            <path d="M15 33c5 2 13 2 18 0l-3 5H18Z" fill="#34243c" />
            <path d="m19 34 2 4m4-4v4m4-4-2 4" stroke="#ffcf6b" stroke-linecap="round" stroke-width="1.4" />
          </svg>
        </button>
        <span
          v-for="bat in halloweenBats"
          :key="`bat-${bat.id}`"
          class="seasonal-bat"
          aria-hidden="true"
          :style="{ top: bat.top, animationDelay: bat.delay, animationDuration: bat.duration }"
        >🦇</span>
      </template>
      <span
        v-else
        v-for="particle in seasonalParticles"
        :key="particle.id"
        aria-hidden="true"
        :style="{ left: particle.left, animationDelay: particle.delay, animationDuration: particle.duration, fontSize: particle.size, opacity: particle.opacity }"
      >❄</span>
    </div>
    <div v-if="halloweenMessageVisible" class="halloween-toast" role="status">🎃 Happy Halloween!! 👻</div>
    <aside class="scanner-sidebar">
      <a class="scanner-brand" href="#top" aria-label="Cobra MemeScope home" @click.prevent="navigateToLanding">
        <img class="scanner-brand-mark" src="/mascot-profile.png" alt="" />
        <span>COBRA <span>MEMESCOPE</span></span>
      </a>
      <div class="scanner-edition">ON-CHAIN RISK DESK <span>V1.0</span></div>
      <div class="scanner-nav-label">WORKSPACE</div>
      <nav class="scanner-nav" aria-label="Main navigation">
        <button type="button" :class="{ selected: activePage === 'landing' }" :aria-current="activePage === 'landing' ? 'page' : undefined" @click="navigateToLanding">home<i class="nav-home-icon"><House aria-hidden="true" /></i></button>
        <button type="button" :class="{ selected: activePage === 'scanner' }" :aria-current="activePage === 'scanner' ? 'page' : undefined" @click="goToScanner">analyze token<i>⌕</i></button>
        <button type="button" :class="{ selected: activePage === 'markets' }" :aria-current="activePage === 'markets' ? 'page' : undefined" @click="activePage = 'markets'">market tape<i>↗</i></button>
        <button type="button" :class="{ selected: activePage === 'watchlist' }" :aria-current="activePage === 'watchlist' ? 'page' : undefined" @click="activePage = 'watchlist'">watchlist<i class="nav-watchlist-icon"><span aria-hidden="true">☆</span><small>{{ (favorites.length + savedTrendingCoins.length).toString().padStart(2, '0') }}</small></i></button>
      </nav>
      <div class="scanner-nav-label chain-label">SUPPORTED CHAINS</div>
      <div class="chain-list">
        <div v-for="chain in supportedChains" :key="chain.chainId" class="chain-row">
          <span class="chain-logo" v-html="chain.logoSvg" aria-hidden="true"></span>
          <span class="chain-name">{{ chain.name }}</span>
          <small>{{ chain.count }}</small>
        </div>
      </div>
      <div class="scanner-sidebar-bottom"><span>READ THE SIGNALS</span><p>Risk indicators are snapshots, not guarantees. A clean scan cannot rule out a rug pull.</p><small>COBRA MEMESCOPE <b>·</b> 2026</small></div>
    </aside>

    <main id="top" class="scanner-main home-page">
      <header class="scanner-topbar" :class="{ 'landing-header': activePage === 'landing' }">
        <div class="scanner-breadcrumb">RISK TERMINAL <span>/</span> <strong>{{ pageHeading.toUpperCase() }}</strong></div>
        <div class="scanner-top-actions">
          <div class="feed-state">
            <span :class="trendingCoins.length > 0 ? 'feed-live' : 'feed-sample'"></span>
            {{ trendingCoins.length > 0 ? 'FRESH FEED LIVE' : trendingLoading ? 'FINDING LAUNCHES' : 'FRESH FEED OFFLINE' }}
          </div>
          <div class="watchlist-notifications">
            <button class="notification-trigger" type="button" :aria-expanded="notificationsOpen" aria-label="Notifications" @click="primeNotificationAudio(); notificationsOpen = !notificationsOpen"><Bell :size="17" :stroke-width="1.8" /><i v-if="unreadNotificationCount">{{ unreadNotificationCount }}</i></button>
            <section v-if="notificationsOpen" class="notification-popover" aria-label="Notifications">
              <header class="notification-header"><strong>Notifications</strong><div class="notification-tools"><label><input type="checkbox" :checked="notificationSoundEnabled" @change="setNotificationSound(($event.target as HTMLInputElement).checked)" /> SOUND</label><button type="button" :disabled="watchlistAlerts.length + donationNotifications.length === 0" @click="clearNotifications">CLEAR ALL</button><button type="button" aria-label="Close notifications" @click="notificationsOpen = false">×</button></div></header>
              <article v-for="notification in donationNotifications" :key="notification.id" class="notification-item">
                <a v-if="notification.status === 'submitted'" class="notification-open" :href="notification.explorerUrl" target="_blank" rel="noreferrer" @click="markDonationNotificationRead(notification)">
                  <span class="notification-direction alert-up">✓</span>
                  <span><strong>{{ notification.amount }} {{ notification.symbol }} donation submitted</strong><small>{{ notification.chain }} · {{ new Date(notification.createdAt).toLocaleString() }} · {{ notification.signature?.slice(0, 9) }}…</small></span>
                  <b v-if="!notification.read" aria-label="Unread">•</b>
                </a>
                <button v-else type="button" class="notification-open" @click="markDonationNotificationRead(notification)">
                  <span class="notification-direction alert-down">!</span>
                  <span><strong>{{ notification.chain }} donation failed</strong><small>{{ notification.message }} · {{ new Date(notification.createdAt).toLocaleString() }}</small></span>
                  <b v-if="!notification.read" aria-label="Unread">•</b>
                </button>
                <button class="notification-remove" :aria-label="`Remove ${notification.chain} donation notification`" title="Remove notification" @click="removeDonationNotification(notification.id)">×</button>
              </article>
              <article v-for="alert in watchlistAlerts" :key="alert.id" class="notification-item">
                <button type="button" class="notification-open" @click="openWatchlistAlert(alert)">
                  <span class="notification-direction" :class="alert.changePercent >= 0 ? 'alert-up' : 'alert-down'">{{ alert.changePercent >= 0 ? '↑' : '↓' }}</span>
                  <span><strong>{{ alert.name }} is {{ alert.changePercent >= 0 ? 'up' : 'down' }} {{ Math.abs(alert.changePercent).toFixed(1) }}% since added</strong><small>Tracked for {{ trackingDuration(alert.watchStartedAt || alert.createdAt) }} · Alerts continue until removed</small></span>
                  <b v-if="!alert.read" aria-label="Unread">•</b>
                </button>
                <button type="button" class="notification-remove" :aria-label="`Remove ${alert.name} notification`" title="Remove notification" @click="removeWatchlistAlert(alert.id)">×</button>
              </article>
              <p v-if="watchlistAlerts.length === 0 && donationNotifications.length === 0" class="notification-empty">Donation receipts and watchlist price alerts will appear here.</p>
            </section>
          </div>
          <DonateButton @transaction="recordDonationNotification" @transaction-failed="recordDonationFailure" />
          <WalletButton @wallet-session="handleWalletSession" @wallet-signed-out="handleWalletSignedOut" @wallet-banned="handleWalletBanned" @account-deleted="handleAccountDeleted" />
        </div>
      </header>

      <section v-if="activePage === 'landing'" class="landing-page home-landing">
        <section class="landing-announcements" aria-labelledby="landing-announcements-title">
          <header class="landing-announcements-header">
            <div>
              <div class="scan-eyebrow"><span></span> COBRA MEMESCOPE UPDATES</div>
              <h2 id="landing-announcements-title">Announcements<span>.</span></h2>
            </div>
          </header>
          <div v-if="currentAnnouncement" class="announcement-carousel" aria-roledescription="carousel" aria-label="Cobra MemeScope announcements">
            <article :key="currentAnnouncement.id" class="landing-announcement-slide" aria-live="polite">
              <img v-if="currentAnnouncement.imageUrl" class="announcement-slide-image" :src="currentAnnouncement.imageUrl" :alt="`${currentAnnouncement.title} announcement`" />
              <div v-else class="announcement-slide-art" aria-hidden="true"><span>MS</span><i></i><b></b></div>
              <div class="announcement-slide-content">
                <div class="landing-announcement-meta">
                  <span>{{ currentAnnouncement.badge }}</span>
                  <time>{{ currentAnnouncement.eventDate }}</time>
                </div>
                <h3>{{ currentAnnouncement.title }}</h3>
                <p>{{ currentAnnouncement.description }}</p>
                <div class="announcement-slide-footer">
                  <span>COBRA MEMESCOPE COMMUNITY UPDATE</span>
                </div>
              </div>
              <span class="landing-announcement-number">{{ String((currentSlide % landingSlides.length) + 1).padStart(2, '0') }}</span>
            </article>
          </div>
          <p v-else class="announcement-empty">New announcements will appear here soon.</p>
          <p class="announcement-caption">Events, product news, and community updates from Cobra MemeScope.</p>
        </section>

        <section class="landing-intro" aria-labelledby="landing-intro-title">
          <div class="scan-eyebrow"><span></span> MEMECOIN RESEARCH & MARKET SIGNALS</div>
          <h1 id="landing-intro-title">See the signal.<br /><em>Skip the guesswork.</em></h1>
          <p>Cobra MemeScope helps you explore new memecoins, follow cross-chain market activity, and review token and liquidity risk signals before making your own decision. Research tools are informative—not financial advice or a guarantee of safety.</p>
          <aside class="landing-use-notice" aria-label="What Cobra MemeScope does and does not do">
            <strong>Research and tracking—not an exchange</strong>
            <p>Cobra MemeScope is an educational research tool for people new to memecoins and experienced traders alike. It does not accept deposits, buy or sell crypto, or hold your funds. Connect a wallet to view its SOL balance and detected memecoin holdings; your assets remain in your wallet. Any optional wallet transaction, such as a donation, must be initiated and approved by you in your wallet.</p>
          </aside>
          <button type="button" class="landing-intro-action" @click="activePage = 'markets'">EXPLORE LIVE MARKETS <span aria-hidden="true">↗</span></button>
        </section>

        <section class="mobile-install-card" aria-labelledby="mobile-install-title">
          <div class="mobile-install-copy">
            <div class="scan-eyebrow"><span></span> COBRA MEMESCOPE ON MOBILE</div>
            <h2 id="mobile-install-title">Your risk desk, in your pocket.</h2>
            <p>Install Cobra MemeScope on your phone for quick access from your home screen. No app-store download is needed.</p>
            <button type="button" class="mobile-install-button" :disabled="isPwaInstalled" @click="installMemeScopeApp">
              {{ isPwaInstalled ? 'COBRA MEMESCOPE IS INSTALLED' : 'INSTALL COBRA MEMESCOPE' }}
              <span aria-hidden="true">{{ isPwaInstalled ? '✓' : '↓' }}</span>
            </button>
            <p v-if="installMessage" class="mobile-install-message" role="status">{{ installMessage }}</p>
          </div>
          <div class="mobile-install-art" aria-hidden="true">
            <div class="mobile-install-orbit"></div>
            <div class="mobile-install-phone">
              <span class="mobile-install-phone-top"></span>
              <img class="mobile-install-phone-mark" src="/icons/cobra-192.png" alt="" />
              <strong>COBRA MEMESCOPE</strong>
              <small>ON-CHAIN RISK DESK</small>
              <span class="mobile-install-phone-signal"></span>
            </div>
          </div>
        </section>
      </section>

      <section v-else-if="activePage === 'scanner'" class="scan-page">
        <div class="scan-intro">
          <div><div class="scan-eyebrow"><span></span> TOKEN ANALYSIS <b>/</b> CONTRACT INTELLIGENCE</div><h1>Analyze a token.<br /><em>Know the risks.</em></h1></div>
          <p>Review available contract controls, holder concentration, liquidity, and market activity before making your own decision.</p>
        </div>

        <form class="address-form" @submit.prevent="runScan">
          <label for="contract-address">TOKEN CONTRACT / MINT ADDRESS</label>
          <div class="address-form-row">
            <div class="address-input-wrap"><span class="input-prefix">ADDR</span><input id="contract-address" v-model="scanAddress" type="text" maxlength="64" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste a Solana mint or EVM contract address" /></div>
            <button type="submit" :disabled="scanLoading">{{ scanLoading ? 'SCANNING...' : 'ANALYZE ADDRESS' }}<span>{{ scanLoading ? '◌' : '↗' }}</span></button>
          </div>
          <div class="address-form-foot"><span>Solana and supported EVM addresses detected automatically</span><kbd>ENTER ↵</kbd></div>
        </form>

        <AdsBanner />

        <div v-if="scanError" class="scan-error" role="alert"><span>!</span>{{ scanError }}</div>
        <div v-if="scanLoading" class="scan-progress" role="status"><span class="scan-spinner"></span><div><strong>Collecting contract signals</strong><small>Reading provider risk checks and current pool activity</small></div></div>
        <ScanReport v-else-if="scanResult" :report="scanResult" />
        <section v-else class="signal-index" aria-label="Scan coverage">
          <div class="signal-index-heading"><div><span>SCAN COVERAGE</span><h2>Signals over promises.</h2></div><span>01—03</span></div>
          <div class="signal-index-grid">
            <article><span>01</span><div><strong>Owner controls</strong><p>Mint, freeze, honeypot and tax controls where provider data is available.</p></div><b>↗</b></article>
            <article><span>02</span><div><strong>Who holds supply</strong><p>Creator exposure and concentration among the largest reported holders.</p></div><b>↗</b></article>
            <article><span>03</span><div><strong>Can liquidity exit?</strong><p>Pool depth, pool age and observed buy/sell activity from live markets.</p></div><b>↗</b></article>
          </div>
        </section>
        <p class="scan-disclaimer">A scan is a point-in-time indicator, not an audit or a guarantee. Unknown checks are not clean checks.</p>
      </section>

      <section v-else class="market-page">
        <div class="market-page-head">
          <div>
            <div class="scan-eyebrow"><span></span> {{ activePage === 'markets' ? 'CROSS-CHAIN DISCOVERY' : 'SAVED ASSETS' }} <b>/</b> {{ activePage === 'markets' ? 'POOL AGE ≤ 30 DAYS' : 'LOCAL WATCHLIST' }}</div><h1>{{ pageHeading }}<em>.</em></h1><p>{{ activePage === 'watchlist' ? 'Tokens you have starred for another look.' : 'Fresh community launches ranked by movement, activity, and pool depth.' }}</p>
          </div>
          <div class="market-head-actions"><small>{{ activePage === 'markets' ? `UPDATED ${trendingUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : (liveData ? 'LIVE MARKET DATA' : 'SAMPLE SNAPSHOT') }}</small><button type="button" :disabled="activePage === 'markets' ? trendingLoading : loading" aria-label="Refresh market data" @click="activePage === 'markets' ? loadTrending() : loadMarket()">↻</button><button class="go-scan" type="button" @click="activePage = 'scanner'">SCAN CONTRACT <span>↗</span></button></div>
        </div>

        <template v-if="activePage === 'markets'">
          <div class="market-totals"><div><span>FRESH PAIRS</span><strong>{{ trendingCoins.length }}</strong></div><div><span>COMBINED LIQUIDITY</span><strong>{{ formatCurrency(totalTrendingLiquidity, true) }}</strong></div><div><span>24H VOLUME</span><strong>{{ formatCurrency(totalTrendingVolume, true) }}</strong></div><div><span>FAST GROWERS</span><strong>{{ fastGrowerCount }}</strong></div></div>
          <div class="discovery-controls">
            <div class="discovery-tabs" role="tablist" aria-label="Filter new launches">
              <button type="button" role="tab" :aria-selected="trendingMode === 'all'" :class="{ active: trendingMode === 'all' }" @click="trendingMode = 'all'; showAllTrending = false">ALL LAUNCHES <span>{{ trendingCoins.length }}</span></button>
              <button type="button" role="tab" :aria-selected="trendingMode === 'fast'" :class="{ active: trendingMode === 'fast' }" @click="trendingMode = 'fast'; showAllTrending = false">FAST GROWERS <span>{{ fastGrowerCount }}</span></button>
              <button type="button" role="tab" :aria-selected="trendingMode === 'clear'" :class="{ active: trendingMode === 'clear' }" @click="trendingMode = 'clear'; showAllTrending = false">REVIEW CLEAR <span>{{ trendingCoins.filter((coin) => coin.risk.level === 'clear').length }}</span></button>
              <button type="button" role="tab" :aria-selected="trendingMode === 'boosted'" :class="{ active: trendingMode === 'boosted' }" @click="trendingMode = 'boosted'; showAllTrending = false">BOOSTED COINS <span>{{ boostedCoinCount }}</span></button>
            </div>
            <label class="market-search discovery-search">
              <span aria-hidden="true">⌕</span>
              <input v-model="trendingSearchQuery" type="search" placeholder="Search memecoins" aria-label="Search memecoins by name, ticker, or contract address" @input="showAllTrending = false" />
            </label>
          </div>
          <div class="chain-filters" role="group" aria-label="Filter launches by chain">
            <span>CHAIN</span>
            <button type="button" :class="{ active: selectedTrendingChain === 'all' }" :aria-pressed="selectedTrendingChain === 'all'" @click="selectedTrendingChain = 'all'; showAllTrending = false">All chains <small>{{ trendingCoins.length }}</small></button>
            <button v-for="chain in supportedChains" :key="chain.chainId" type="button" :class="{ active: selectedTrendingChain === chain.chainId }" :aria-pressed="selectedTrendingChain === chain.chainId" @click="selectedTrendingChain = chain.chainId; showAllTrending = false">
              <span class="filter-chain-logo" v-html="chain.logoSvg" aria-hidden="true"></span>
              <span>{{ chain.name }}</span>
              <small>{{ chain.count }}</small>
            </button>
          </div>
          <div class="market-news-ticker" role="region" aria-label="Live 24-hour price changes for newly listed cross-chain tokens. Positive percentages are gains; negative percentages are declines.">
            <span class="market-news-live" :class="{ 'market-news-waiting': tickerTrendingCoins.length === 0 }"><i></i>{{ tickerTrendingCoins.length ? 'LIVE' : 'FEED' }}</span>
            <div class="market-news-window" aria-hidden="true">
              <div class="market-news-track">
                <span v-if="tickerTrendingCoins.length" class="market-news-copy">
                  <span v-for="coin in tickerTrendingCoins" :key="`${coin.chainId}:${coin.address}`" class="market-news-mover">
                    <TokenLogo class="market-news-token-icon" :src="coin.image" :symbol="coin.symbol" :address="coin.address" :size="18" />
                    <strong>{{ coin.symbol }}</strong>
                    <span :class="coin.change24h > 0 ? 'move-up' : coin.change24h < 0 ? 'move-down' : 'move-flat'">{{ coin.change24h > 0 ? '+' : '' }}{{ coin.change24h.toFixed(1) }}%</span>
                    <small>{{ coin.change24h > 0 ? 'UP' : coin.change24h < 0 ? 'DOWN' : 'FLAT' }} 24H</small>
                    <b>✳</b>
                  </span>
                </span>
                <span v-else class="market-news-copy">WAITING FOR LIVE MARKET PAIRS · 24H MOVEMENT WILL APPEAR HERE</span>
                <span v-if="tickerTrendingCoins.length" class="market-news-copy" aria-hidden="true">
                  <span v-for="coin in tickerTrendingCoins" :key="`${coin.chainId}:${coin.address}:repeat`" class="market-news-mover">
                    <TokenLogo class="market-news-token-icon" :src="coin.image" :symbol="coin.symbol" :address="coin.address" :size="18" />
                    <strong>{{ coin.symbol }}</strong>
                    <span :class="coin.change24h > 0 ? 'move-up' : coin.change24h < 0 ? 'move-down' : 'move-flat'">{{ coin.change24h > 0 ? '+' : '' }}{{ coin.change24h.toFixed(1) }}%</span>
                    <small>{{ coin.change24h > 0 ? 'UP' : coin.change24h < 0 ? 'DOWN' : 'FLAT' }} 24H</small>
                    <b>✳</b>
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div v-if="trendingError && trendingCoins.length" class="market-error" role="status"><strong>Showing saved launch data</strong><span>{{ trendingError }} Market values may be out of date.</span><button type="button" @click="loadTrending">RETRY ↻</button></div>
          <div v-if="trendingError && !trendingCoins.length" class="market-error" role="alert"><strong>Live launch feed unavailable</strong><span>{{ trendingError }}</span><button type="button" @click="loadTrending">RETRY ↻</button></div>
          <div v-else-if="trendingLoading && !trendingCoins.length" class="market-loading" role="status"><span class="scan-spinner"></span><div><strong>Finding fresh launches</strong><small>Checking recent pairs, activity, liquidity, and contract reviews</small></div></div>
          <div v-else-if="trendingSearchQuery.trim() && visibleTrendingCoins.length === 0" class="market-empty"><strong>No memecoins match “{{ trendingSearchQuery.trim() }}”.</strong><span>Try another name, ticker, or contract address.</span></div>
          <div v-else-if="trendingMode === 'clear' && visibleTrendingCoins.length === 0" class="market-empty"><strong>No fully clear reviews in the current fresh pool list.</strong><span>That does not make other tokens safe; their review may have warnings or missing data.</span></div>
          <div v-else-if="trendingMode === 'boosted' && visibleTrendingCoins.length === 0" class="market-empty"><strong>No boosted coins found in the current fresh pool list.</strong><span>Boosted listings will appear here when they match the current launch and market data filters.</span></div>
          <TrendingTable v-else :coins="displayedTrendingCoins" :watchlist-keys="savedTrendingKeys" :liquidity-changes="liquidityChanges" @scan="scanTrendingCoin" @select="selectMarketCoin" @watchlist-toggle="toggleTrendingWatchlist" />
          <div v-if="visibleTrendingCoins.length > 20" class="show-more-launches"><span>Showing {{ displayedTrendingCoins.length }} of {{ visibleTrendingCoins.length }} launches</span><button type="button" @click="showAllTrending = !showAllTrending">{{ showAllTrending ? 'SHOW LESS' : `SHOW ${remainingTrendingCount} MORE` }} <span>{{ showAllTrending ? '↑' : '↓' }}</span></button></div>
          <div class="market-foot"><span>Showing up to 50 qualified pools from supported chains, created within the last 30 days.</span><span>Explicit high-risk reviews are excluded when detected. A clear review is not a safety guarantee.</span></div>
        </template>

        <template v-else>
          <div class="market-totals"><div><span>PINNED FRESH TOKENS</span><strong>{{ savedTrendingCoins.length }}</strong></div><div><span>LAST KNOWN LIQUIDITY</span><strong>{{ formatCurrency(savedTrendingLiquidity, true) }}</strong></div><div><span>LAST KNOWN 24H VOLUME</span><strong>{{ formatCurrency(savedTrendingVolume, true) }}</strong></div><div><span>OLDER WATCHLIST</span><strong>{{ favorites.length }}</strong></div></div>
          <div class="market-controls"><div class="market-caption">PINNED NEW TOKENS <span>· {{ visibleSavedTrendingCoins.length }} saved</span></div><label class="market-search"><span>⌕</span><input v-model="query" type="search" placeholder="Filter name, ticker, address" aria-label="Filter watchlist tokens" /></label></div>
          <TrendingTable :coins="visibleSavedTrendingCoins" :watchlist-keys="savedTrendingKeys" :liquidity-changes="liquidityChanges" @scan="scanTrendingCoin" @select="selectMarketCoin" @watchlist-toggle="toggleTrendingWatchlist" />
          <section v-if="visibleCoins.length" class="older-watchlist"><div class="market-caption">OLDER MARKET ASSETS <span>· {{ visibleCoins.length }} saved</span></div><div id="coin-table"><CoinTable :coins="visibleCoins" :favorites="favorites" :loading="loading" filter="Watchlist" @select="selectedListedCoin = $event" @toggle-favorite="toggleFavorite" @sort="sortKey = $event" /></div></section>
          <div class="market-foot"><span>Saved fresh tokens stay here even when they leave discovery.</span><span>Market values refresh every minute when data is available.</span></div>
        </template>
      </section>

      <footer class="scanner-footer"><span>COBRA MEMESCOPE <b>/</b> ON-CHAIN RISK DESK</span><span>Independent signals. Always verify on-chain.</span></footer>
    </main>
    <MarketCoinDetail :coin="selectedMarketCoin" @close="selectedMarketCoin = null" @scan="scanTrendingCoin" />
    <CoinMarketDetail :coin="selectedListedCoin" @close="selectedListedCoin = null" />
      <AssistantChat :scan-context="assistantScanContext" :auth-token="walletSession?.token || ''" />
  </div>

  <div v-if="bannedUser" class="banned-access-shell">
    <div class="banned-access-backdrop">
      <div class="banned-access-card" role="alertdialog" aria-modal="true" aria-labelledby="banned-user-title">
        <div class="banned-access-crest" aria-hidden="true">
          <img src="/icons/cobra-192.png" alt="" />
          <span class="banned-access-slash"></span>
          <span class="banned-access-alert">!</span>
        </div>
        <h1 id="banned-user-title">You're <span>Banned</span></h1>
        <p class="banned-access-subline">of <strong>Cobra Memescope</strong></p>
        <div class="banned-access-panel">
          <div class="banned-access-panel-header">
            <span class="banned-access-warning" aria-hidden="true">!</span>
            <strong>Violation</strong>
          </div>
          <p>{{ bannedUser.reason || 'You have been banned due to a violation of our community rules and terms of service.' }}</p>
        </div>
        <button type="button" class="banned-signout-button" @click="handleBannedSignOut">
          <span class="banned-signout-icon" aria-hidden="true">↪</span>
          Sign Out
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.landing-page {
  display: grid;
  gap: 28px;
  padding: 26px 0 12px;
}

.home-landing {
  display: grid;
  min-width: 0;
  gap: 22px;
  padding-top: 18px;
}

.home-page {
  background: #021b22;
}

.home-page .scanner-main {
  background: #021b22;
}

.landing-header {
  border-bottom: 1px solid rgba(148, 166, 164, 0.2);
  background: rgba(2, 17, 23, 0.92);
}

.landing-breadcrumb,
.landing-top-actions,
.home-copy,
.home-address-form,
.home-ad-banner,
.home-coverage,
.coverage-grid,
.coverage-card {
  position: relative;
  z-index: 1;
}

.landing-breadcrumb {
  display: inline-flex;
  align-items: center;
  color: rgba(193, 210, 215, 0.7);
  font: 700 0.82rem 'DM Mono', monospace;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.landing-breadcrumb span {
  margin: 0 8px;
  opacity: 0.7;
}

.landing-top-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.feed-state {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(195, 211, 219, 0.82);
  font: 700 0.75rem 'DM Mono', monospace;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.feed-state .feed-live {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #76f9a7;
  box-shadow: 0 0 12px rgba(118, 249, 167, 0.8);
}

.theme-toggle,
.donate-mini-button,
.signin-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(147, 169, 175, 0.22);
  background: rgba(255, 255, 255, 0.02);
  color: #dadfe0;
  font: 700 0.62rem 'DM Mono', monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.theme-toggle {
  gap: 8px;
  padding: 0 10px;
}

.donate-mini-button {
  padding: 0 12px;
  border-color: rgba(113, 179, 139, 0.45);
}

.signin-button {
  padding: 0 18px;
  background: rgba(255, 255, 255, 0.03);
}

.home-hero {
  display: grid;
  gap: 18px;
  padding: 22px 0 0;
}

.hero-heading-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(180px, 0.8fr);
  gap: 24px;
  align-items: end;
}

.home-copy {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 10px;
}

.home-copy h1 {
  margin: 0;
  color: #edf4f6;
  font-size: clamp(3.1rem, 5vw, 5.8rem);
  line-height: 0.92;
  letter-spacing: -0.07em;
  font-weight: 800;
}

.home-copy h1 em {
  color: #6ef9ae;
  font-style: normal;
  text-decoration: none;
}

.home-copy p {
  max-width: 440px;
  margin: 0;
  color: rgba(193, 210, 215, 0.74);
  font-size: 1.15rem;
  line-height: 1.55;
  text-align: left;
}

.home-address-form {
  margin-top: 8px;
  padding: 0;
  background: transparent;
  border: 1px solid rgba(169, 186, 189, 0.2);
  border-radius: 12px;
  overflow: hidden;
}

.home-address-form label {
  display: block;
  padding: 10px 18px 8px;
  color: #dce9ec;
  font: 700 0.95rem 'DM Sans', sans-serif;
  letter-spacing: 0.01em;
}

.home-landing .home-address-form .address-form-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 0;
}

.home-landing .home-address-form .address-input-wrap {
  display: flex;
  align-items: center;
  min-height: 70px;
  padding: 0 18px;
  box-sizing: border-box;
  border-right: 1px solid rgba(169, 186, 189, 0.2);
  background: rgba(11, 31, 38, 0.68);
}

.home-landing .home-address-form .address-input-wrap:focus-within {
  box-shadow: inset 0 0 0 2px #7af7b3;
}

.home-landing .home-address-form .address-input-wrap .input-prefix {
  color: #a9c0c4;
  font: 700 0.95rem 'DM Mono', monospace;
  letter-spacing: 0.18em;
}

.home-landing .home-address-form .address-input-wrap input {
  width: 100%;
  min-width: 0;
  min-height: 68px;
  padding: 0 0 0 14px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #ffffff;
  font-size: 1.45rem;
}

.home-landing .home-address-form .address-input-wrap input::placeholder {
  color: #b7c9cc;
  font-family: 'DM Sans', sans-serif;
  font-size: 1.15rem;
  opacity: 1;
}

.home-landing .home-address-form .address-form-row > button {
  min-height: 70px;
  padding: 0 22px;
  border: 0;
  border-radius: 0;
  background: #7af7b3;
  color: #031d1b;
  font: 800 1rem 'DM Mono', monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.home-landing .home-address-form .address-form-row > button:hover:not(:disabled) {
  background: #a0ffcb;
}

.home-landing .home-address-form .address-form-row > button:focus-visible {
  outline: 3px solid #ffffff;
  outline-offset: -5px;
}

.home-address-form button span {
  margin-left: 10px;
  font-size: 1.1rem;
}

.address-form-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 40px;
  padding: 6px 18px;
  border-top: 1px solid rgba(169, 186, 189, 0.2);
  color: rgba(176, 194, 200, 0.7);
  font-size: 0.92rem;
  letter-spacing: 0.02em;
}

.address-form-foot kbd {
  border: 1px solid rgba(169, 186, 189, 0.22);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  color: #edf4f6;
  font: 700 0.78rem 'DM Mono', monospace;
  letter-spacing: 0.14em;
  padding: 4px 8px;
}

.home-ad-banner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 88px;
  padding: 20px 22px;
  border: 1px solid rgba(152, 171, 176, 0.22);
  border-radius: 14px;
  background: linear-gradient(90deg, rgba(18, 35, 38, 0.9), rgba(14, 24, 31, 0.9));
}

.ad-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 112px;
  min-height: 38px;
  border: 1px solid rgba(208, 220, 220, 0.3);
  border-radius: 999px;
  color: rgba(217, 230, 232, 0.82);
  font: 700 0.76rem 'DM Mono', monospace;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.ad-copy {
  display: grid;
  gap: 6px;
}

.ad-copy h3 {
  margin: 0;
  color: rgba(237, 245, 246, 0.95);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.ad-copy p {
  margin: 0;
  color: rgba(185, 203, 208, 0.7);
  font-size: 1.05rem;
  line-height: 1.5;
}

.home-ad-banner button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 18px;
  border: 1px solid rgba(123, 245, 179, 0.5);
  border-radius: 10px;
  background: rgba(122, 247, 179, 0.14);
  color: #dfffe9;
  font: 700 0.85rem 'DM Mono', monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.home-ad-banner button span {
  font-size: 1rem;
}

.home-coverage {
  display: grid;
  gap: 16px;
  padding: 6px 0 0;
}

.coverage-header {
  display: grid;
  gap: 14px;
}

.coverage-heading-row {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
}

.coverage-heading-row h2 {
  margin: 0;
  color: #edf4f6;
  font-size: clamp(2rem, 3vw, 3rem);
  letter-spacing: -0.06em;
}

.coverage-heading-row span {
  color: rgba(185, 203, 208, 0.65);
  font: 700 0.9rem 'DM Mono', monospace;
  letter-spacing: 0.16em;
}

.coverage-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border: 1px solid rgba(160, 177, 181, 0.22);
  border-radius: 0;
  overflow: hidden;
}

.coverage-card {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  min-height: 180px;
  padding: 22px 20px 18px;
  background: rgba(10, 28, 35, 0.42);
  border-right: 1px solid rgba(160, 177, 181, 0.22);
}

.coverage-card:last-child {
  border-right: 0;
}

.coverage-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(173, 196, 203, 0.25);
  border-radius: 50%;
  color: rgba(237, 245, 246, 0.9);
  font: 700 0.88rem 'DM Mono', monospace;
}

.coverage-card h3 {
  margin: 14px 0 0;
  color: #edf4f6;
  font-size: 1.4rem;
  letter-spacing: -0.04em;
}

.coverage-card p {
  margin: 12px 0 0;
  color: rgba(180, 199, 203, 0.78);
  font-size: 1.08rem;
  line-height: 1.65;
}

.coverage-card button {
  width: 32px;
  height: 32px;
  margin-top: 18px;
  border: 1px solid rgba(160, 177, 181, 0.22);
  border-radius: 50%;
  background: transparent;
  color: #eaf5f5;
  font-size: 1rem;
}

.coverage-note {
  margin: 0;
  color: rgba(180, 199, 203, 0.72);
  font-size: 0.82rem;
  line-height: 1.6;
}

.landing-announcements,
.mobile-install-card {
  margin-top: 42px;
}

.landing-announcements {
  margin-top: 0;
}

.landing-header {
  justify-content: space-between;
}

.landing-intro {
  display: grid;
  justify-items: start;
  gap: 18px;
  margin-bottom: 46px;
  padding: clamp(26px, 5vw, 64px);
  border: 1px solid rgba(122, 247, 179, 0.2);
  background:
    radial-gradient(ellipse at 88% 4%, rgba(122, 247, 179, 0.12), transparent 36%),
    linear-gradient(125deg, rgba(10, 35, 41, 0.96), rgba(6, 23, 29, 0.95));
}

.landing-intro h1 {
  margin: 0;
  color: #edf4f6;
  font: 800 clamp(2.7rem, 6vw, 5rem) / 0.98 Manrope, sans-serif;
  letter-spacing: -0.07em;
}

.landing-intro h1 em {
  color: #6ef9ae;
  font-style: normal;
}

.landing-intro > p {
  max-width: 820px;
  margin: 0;
  color: rgba(193, 210, 215, 0.86);
  font-size: clamp(1rem, 1.5vw, 1.22rem);
  line-height: 1.7;
}

.landing-use-notice {
  display: grid;
  max-width: 900px;
  gap: 7px;
  padding: 14px 16px;
  border: 1px solid rgba(122, 247, 179, 0.22);
  border-left: 3px solid #7af7b3;
  background: rgba(2, 15, 20, 0.5);
}

.landing-use-notice strong {
  color: #a0ffcb;
  font: 700 0.76rem 'DM Mono', monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.landing-use-notice p {
  margin: 0;
  color: rgba(193, 210, 215, 0.82);
  font-size: 0.9rem;
  line-height: 1.65;
}

.landing-intro-action {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  gap: 18px;
  margin-top: 4px;
  padding: 0 18px;
  border: 1px solid #7af7b3;
  background: #7af7b3;
  color: #031d1b;
  font: 800 0.82rem 'DM Mono', monospace;
  letter-spacing: 0.06em;
}

.landing-intro-action:hover {
  background: #a0ffcb;
}

.landing-intro-action span {
  font-size: 1.1rem;
}

.landing-announcements {
  display: grid;
  min-width: 0;
  gap: 22px;
}

.landing-announcements-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.landing-announcements-header h2,
.mobile-install-copy h2 {
  margin: 10px 0 0;
  color: #edf4f6;
  font-size: clamp(2rem, 3vw, 2.8rem);
  letter-spacing: -0.055em;
}

.landing-announcements-header h2 span {
  color: #6ef9ae;
}

.landing-announcement-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.landing-announcement-card {
  position: relative;
  min-width: 0;
  min-height: 220px;
  padding: 22px;
  overflow: hidden;
  border: 1px solid rgba(160, 177, 181, 0.22);
  background: linear-gradient(145deg, rgba(14, 38, 43, 0.92), rgba(8, 26, 32, 0.92));
}

.landing-announcement-card > img {
  display: block;
  width: calc(100% + 44px);
  max-height: 150px;
  margin: -22px -22px 18px;
  object-fit: cover;
}

.landing-announcement-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #9fb5b9;
  font: 700 0.72rem 'DM Mono', monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.landing-announcement-meta > span {
  color: #82f7b0;
}

.landing-announcement-card h3 {
  position: relative;
  margin: 18px 0 0;
  color: #edf4f6;
  font-size: 1.35rem;
  letter-spacing: -0.035em;
}

.landing-announcement-card p {
  position: relative;
  margin: 10px 0 0;
  color: rgba(193, 210, 215, 0.78);
  font-size: 1rem;
  line-height: 1.6;
}

.landing-announcement-number {
  position: absolute;
  right: 14px;
  bottom: 8px;
  color: rgba(126, 160, 164, 0.16);
  font: 800 3.5rem Manrope, sans-serif;
}

.announcement-carousel {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(160, 177, 181, 0.25);
  background: #081b21;
}

.landing-announcement-slide {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 360px;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  overflow: hidden;
  animation: announcement-slide-in 0.45s ease both;
}

.announcement-slide-image,
.announcement-slide-art {
  width: 100%;
  height: 100%;
  min-height: 360px;
  object-fit: cover;
}

.announcement-slide-art {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 50%, rgba(110, 249, 174, 0.24), transparent 25%),
    linear-gradient(135deg, #0f3536, #082128 55%, #111d28);
}

.announcement-slide-art::before,
.announcement-slide-art::after {
  position: absolute;
  width: 270px;
  aspect-ratio: 1;
  border: 1px solid rgba(122, 247, 179, 0.27);
  border-radius: 50%;
  content: '';
}

.announcement-slide-art::after {
  width: 200px;
  border-style: dashed;
  opacity: 0.7;
}

.announcement-slide-art > span {
  z-index: 1;
  color: #8df9ba;
  font: 800 clamp(4rem, 8vw, 7rem) Manrope, sans-serif;
  letter-spacing: -0.12em;
  text-shadow: 0 0 45px rgba(110, 249, 174, 0.3);
}

.announcement-slide-art i,
.announcement-slide-art b {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #81f7b5;
  box-shadow: 0 0 16px rgba(129, 247, 181, 0.8);
}

.announcement-slide-art i {
  top: 25%;
  left: 24%;
}

.announcement-slide-art b {
  right: 20%;
  bottom: 25%;
  width: 6px;
  height: 6px;
}

.announcement-slide-content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  padding: clamp(24px, 4vw, 56px);
}

.landing-announcement-slide .landing-announcement-meta {
  justify-content: flex-start;
  gap: 18px;
  font-size: 0.85rem;
}

.landing-announcement-slide .landing-announcement-meta > span {
  padding: 7px 10px;
  border: 1px solid rgba(122, 247, 179, 0.34);
  background: rgba(122, 247, 179, 0.08);
}

.landing-announcement-slide h3 {
  max-width: 680px;
  margin: 24px 0 0;
  color: #edf4f6;
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 1.08;
  letter-spacing: -0.055em;
}

.landing-announcement-slide p {
  max-width: 660px;
  margin: 16px 0 0;
  color: rgba(193, 210, 215, 0.84);
  font-size: clamp(1rem, 1.5vw, 1.2rem);
  line-height: 1.7;
}

.announcement-slide-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 32px;
  padding-top: 18px;
  border-top: 1px solid rgba(160, 177, 181, 0.18);
  color: #89a2a6;
  font: 700 0.7rem 'DM Mono', monospace;
  letter-spacing: 0.1em;
}

.announcement-caption,
.announcement-empty {
  margin: 0;
  color: rgba(193, 210, 215, 0.72);
  font-size: 0.95rem;
  line-height: 1.5;
}

@keyframes announcement-slide-in {
  from { opacity: 0.4; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}

.mobile-install-card {
  position: relative;
  display: grid;
  min-height: 290px;
  grid-template-columns: minmax(0, 1fr) 240px;
  align-items: center;
  gap: 28px;
  padding: 32px;
  overflow: hidden;
  border: 1px solid rgba(123, 245, 179, 0.28);
  border-radius: 14px;
  background:
    radial-gradient(circle at 85% 45%, rgba(122, 247, 179, 0.12), transparent 34%),
    linear-gradient(125deg, #0c252b, #102b2b 60%, #10231f);
}

.mobile-install-copy {
  position: relative;
  z-index: 1;
}

.mobile-install-copy h2 {
  max-width: 580px;
  font-size: clamp(2rem, 3vw, 2.8rem);
}

.mobile-install-copy > p:not(.mobile-install-message) {
  max-width: 560px;
  margin: 12px 0 0;
  color: rgba(193, 210, 215, 0.82);
  font-size: 1.05rem;
  line-height: 1.65;
}

.mobile-install-button {
  display: inline-flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
  padding: 0 20px;
  border: 1px solid #7af7b3;
  border-radius: 8px;
  background: #7af7b3;
  color: #031d1b;
  font: 800 0.9rem 'DM Mono', monospace;
  letter-spacing: 0.06em;
}

.mobile-install-button:hover:not(:disabled) {
  background: #a0ffcb;
}

.mobile-install-button:disabled {
  cursor: default;
  opacity: 0.82;
}

.mobile-install-button span {
  font-size: 1.2rem;
}

.mobile-install-message {
  max-width: 540px;
  margin: 10px 0 0;
  color: #b7d3c6;
  font-size: 0.95rem;
  line-height: 1.55;
}

.mobile-install-art {
  position: relative;
  display: grid;
  min-height: 225px;
  place-items: center;
}

.mobile-install-orbit {
  position: absolute;
  width: 210px;
  aspect-ratio: 1;
  border: 1px solid rgba(122, 247, 179, 0.2);
  border-radius: 50%;
  box-shadow: 0 0 50px rgba(122, 247, 179, 0.08), inset 0 0 40px rgba(122, 247, 179, 0.06);
}

.mobile-install-phone {
  position: relative;
  display: flex;
  width: 144px;
  min-height: 208px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 2px solid #6d8885;
  border-radius: 22px;
  background: linear-gradient(155deg, #07191d, #102b2b);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35), inset 0 0 0 4px #07191d;
  transform: rotate(5deg);
}

.mobile-install-phone-top {
  position: absolute;
  top: 10px;
  width: 42px;
  height: 4px;
  border-radius: 9px;
  background: #3c5554;
}

.mobile-install-phone-mark {
  width: 46px;
  height: 46px;
  border-radius: 8px;
  object-fit: contain;
}

.mobile-install-phone strong {
  color: #ecf6f0;
  font: 800 0.7rem Manrope, sans-serif;
  letter-spacing: 0.05em;
}

.mobile-install-phone small {
  color: #7da09a;
  font: 600 0.48rem 'DM Mono', monospace;
  letter-spacing: 0.07em;
}

.mobile-install-phone-signal {
  width: 46px;
  height: 4px;
  margin-top: 8px;
  border-radius: 4px;
  background: #7af7b3;
  box-shadow: 0 0 12px rgba(122, 247, 179, 0.5);
}

.scan-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(167, 193, 196, 0.7);
  font: 700 0.68rem 'DM Mono', monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.scan-eyebrow span {
  width: 15px;
  height: 1px;
  background: rgba(122, 247, 179, 0.9);
}

.scan-eyebrow b {
  color: rgba(145, 163, 167, 0.8);
  font-weight: 400;
}

.android-install-card {
  position: relative;
  display: grid;
  min-height: 300px;
  grid-template-columns: minmax(0, 1.25fr) minmax(220px, 0.75fr);
  align-items: center;
  gap: 32px;
  overflow: hidden;
  padding: 30px 38px;
  border: 1px solid #35443a;
  border-radius: 22px;
  background:
    radial-gradient(ellipse at 88% 50%, rgb(219 244 106 / 12%), transparent 42%),
    linear-gradient(120deg, #17221a, #202e22 72%, #18231b);
  color: #eef3e8;
  box-shadow: 0 18px 45px rgb(34 47 34 / 10%);
}

.android-install-copy {
  position: relative;
  z-index: 1;
  max-width: 590px;
}

.android-install-kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #c5d39e;
  font: 700 0.68rem 'DM Mono', monospace;
  letter-spacing: 0.1em;
}

.android-install-kicker > span {
  width: 16px;
  height: 2px;
  background: #dbf46a;
}

.android-install-kicker b {
  color: #778374;
  font-weight: 400;
}

.android-install-copy h2 {
  max-width: 520px;
  margin-top: 17px;
  color: #f4f7ee;
  font: 800 clamp(1.8rem, 3vw, 2.7rem) / 1.08 Manrope, sans-serif;
  letter-spacing: -0.055em;
}

.android-install-copy > p:not(.android-install-help) {
  max-width: 520px;
  margin-top: 13px;
  color: #b4c0b0;
  font-size: 0.95rem;
  line-height: 1.7;
}

.android-install-button {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 21px;
  padding: 0 16px;
  border: 1px solid #dbf46a;
  border-radius: 9px;
  background: #dbf46a;
  color: #182018;
  font: 800 0.7rem 'DM Mono', monospace;
  letter-spacing: 0.06em;
  transition: transform 0.18s ease, background 0.18s ease;
}

.android-install-button:hover:not(:disabled) {
  transform: translateY(-2px);
  background: #e7ff83;
}

.android-install-button:disabled {
  cursor: default;
  opacity: 0.8;
}

.android-install-button span {
  font-size: 1.05rem;
}

.android-install-help {
  min-height: 1.5em;
  margin-top: 10px;
  color: #a5b39f;
  font-size: 0.75rem;
  line-height: 1.5;
}

.android-install-art {
  position: relative;
  display: grid;
  min-height: 280px;
  place-items: center;
  isolation: isolate;
}

.android-phone {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(220px, 100%);
  min-height: 258px;
  flex-direction: column;
  gap: 15px;
  padding: 17px 14px 14px;
  transform: rotate(3deg);
  border: 1px solid #5b6a58;
  border-radius: 25px;
  background: linear-gradient(160deg, #111914, #1a271d);
  box-shadow: 0 25px 55px rgb(0 0 0 / 35%), inset 0 0 0 4px #111914;
}

.android-phone-status,
.android-phone-brand,
.android-phone-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font: 600 0.48rem 'DM Mono', monospace;
}

.android-phone-status {
  color: #899787;
}

.android-phone-brand {
  justify-content: flex-start;
  padding-bottom: 11px;
  border-bottom: 1px solid #344334;
  color: #e8efe1;
  font-size: 0.52rem;
  letter-spacing: 0.03em;
}

.android-phone-mark {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  background: #dbf46a;
  color: #1a2419;
  font: 800 0.78rem Manrope, sans-serif;
}

.android-phone-mark span {
  margin-left: 1px;
  color: #77834a;
  font-size: 0.42rem;
}

.android-phone-brand i {
  margin-left: auto;
  color: #b9d279;
  font: normal 600 0.45rem 'DM Mono', monospace;
}

.android-phone-heading {
  display: grid;
  gap: 6px;
}

.android-phone-heading span,
.android-phone-footer {
  color: #a6b584;
  font: 600 0.46rem 'DM Mono', monospace;
  letter-spacing: 0.06em;
}

.android-phone-heading strong {
  color: #f1f4eb;
  font: 800 1rem / 1.1 Manrope, sans-serif;
  letter-spacing: -0.04em;
}

.android-phone-tile {
  display: grid;
  grid-template-columns: 22px 1fr;
  align-items: center;
  gap: 3px 7px;
  padding: 8px;
  border: 1px solid #344333;
  border-radius: 7px;
  background: rgb(255 255 255 / 2%);
}

.android-phone-tile > span {
  grid-row: span 2;
  color: #dbf46a;
  font: 600 0.5rem 'DM Mono', monospace;
}

.android-phone-tile strong {
  color: #e4ebdc;
  font-size: 0.57rem;
}

.android-phone-tile small {
  color: #8e9a87;
  font-size: 0.48rem;
}

.android-phone-footer {
  margin-top: auto;
  padding-top: 5px;
  font-size: 0.42rem;
}

.android-install-orbit {
  position: absolute;
  z-index: -1;
  width: 260px;
  height: 260px;
  border: 1px solid rgb(219 244 106 / 22%);
  border-radius: 50%;
  box-shadow: 0 0 65px rgb(219 244 106 / 7%), inset 0 0 55px rgb(219 244 106 / 5%);
}

.android-install-orbit-two {
  width: 205px;
  height: 205px;
  border-style: dashed;
  opacity: 0.55;
}

@media (max-width: 1100px) {
  .landing-hero {
    grid-template-columns: 1fr;
  }

  .android-install-card {
    gap: 14px;
    padding: 27px;
  }

  .event-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .landing-page {
    padding-top: 20px;
  }

  .landing-hero {
    padding: 20px 16px;
  }

  .landing-actions {
    flex-direction: column;
  }

  .landing-actions button,
  .link-button {
    width: 100%;
  }

  .landing-metrics {
    grid-template-columns: 1fr;
  }

  .landing-events-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .android-install-card {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 25px 20px 18px;
  }

  .android-install-art {
    min-height: 265px;
  }

  .android-install-copy h2 {
    font-size: clamp(1.75rem, 8vw, 2.35rem);
  }

  .landing-hero,
  .android-install-card,
  .landing-events {
    min-width: 0;
  }

  .landing-hero p,
  .android-install-copy p,
  .event-card p {
    overflow-wrap: anywhere;
  }

  .landing-actions button,
  .link-button,
  .android-install-copy button {
    min-height: 44px;
  }

  .event-card {
    min-height: 0;
    padding: 18px;
  }
}

@media (max-width: 430px) {
  .landing-hero {
    padding: 18px 14px;
    border-radius: 14px;
  }

  .landing-hero h1 {
    font-size: clamp(2rem, 10vw, 2.8rem);
    overflow-wrap: anywhere;
  }

  .landing-events-header h2 {
    font-size: 1.5rem;
  }

  .android-install-card {
    padding: 20px 15px 16px;
  }

  .android-install-art {
    min-height: 235px;
  }
}

@media (max-width: 560px) {
  .home-landing .home-address-form .address-form-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .home-landing .home-address-form .address-input-wrap {
    border-right: 0;
  }

  .home-landing .home-address-form .address-form-row > button {
    min-height: 56px;
  }

  .home-landing .home-address-form label {
    padding: 9px 14px 7px;
    font-size: 0.9rem;
  }

  .home-landing .home-address-form .address-input-wrap {
    min-height: 64px;
  }

  .home-landing .home-address-form .address-input-wrap input {
    min-width: 0;
    min-height: 62px;
    font-size: 1.15rem;
  }

  .home-landing .home-address-form .address-input-wrap input::placeholder {
    font-size: 0.95rem;
  }

  .home-landing .home-address-form .address-form-foot {
    min-height: 42px;
    padding: 7px 12px;
    font-size: 0.8rem;
  }
}

@media (max-width: 900px) {
  .landing-announcement-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .landing-announcement-slide {
    grid-template-columns: minmax(200px, 0.7fr) minmax(0, 1.3fr);
  }
}

@media (max-width: 560px) {
  .landing-announcements,
  .mobile-install-card {
    margin-top: 30px;
  }

  .landing-announcements-header {
    align-items: center;
    gap: 12px;
  }

  .landing-announcement-slide {
    grid-template-columns: minmax(0, 1fr);
  }

  .announcement-slide-image,
  .announcement-slide-art {
    min-height: 190px;
    max-height: 220px;
  }

  .announcement-slide-art::before {
    width: 190px;
  }

  .announcement-slide-art::after {
    width: 140px;
  }

  .announcement-slide-content {
    padding: 22px 18px 18px;
  }

  .landing-announcement-slide .landing-announcement-meta {
    font-size: 0.72rem;
  }

  .landing-announcement-slide h3 {
    margin-top: 18px;
    font-size: 2rem;
  }

  .landing-announcement-slide p {
    margin-top: 12px;
    font-size: 1rem;
  }

  .announcement-slide-footer {
    margin-top: 22px;
    padding-top: 14px;
    font-size: 0.62rem;
  }

  .announcement-caption {
    font-size: 0.88rem;
  }

  .mobile-install-card {
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 22px 18px;
  }

  .mobile-install-copy h2 {
    font-size: 2rem;
  }

  .mobile-install-copy > p:not(.mobile-install-message) {
    font-size: 0.98rem;
  }

  .mobile-install-art {
    min-height: 170px;
  }

  .mobile-install-phone {
    width: 116px;
    min-height: 162px;
    border-radius: 18px;
  }

  .mobile-install-orbit {
    width: 160px;
  }

  .landing-intro {
    gap: 14px;
    margin-bottom: 32px;
    padding: 24px 18px;
  }

  .landing-intro h1 {
    font-size: clamp(2.45rem, 12vw, 3.5rem);
  }

  .landing-intro > p {
    font-size: 1rem;
  }

  .landing-intro-action {
    width: 100%;
    justify-content: space-between;
  }
}

@media (min-width: 761px) and (max-width: 900px) {
  .landing-announcement-slide {
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  }

  .announcement-slide-content {
    padding: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-announcement-slide {
    animation: none;
  }
}
.banned-access-shell {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  overflow-y: auto;
  background: rgba(3, 5, 11, 0.78);
  backdrop-filter: blur(5px);
  color: #f6f5ef;
}

.banned-access-backdrop {
  width: min(100%, 476px);
  margin: auto;
}

.banned-access-card {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 28px 28px 26px;
  border: 1px solid rgba(255, 86, 28, 0.78);
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 50% 15%, rgba(120, 26, 13, 0.25), transparent 48%),
    linear-gradient(180deg, rgba(15, 11, 15, 0.99), rgba(8, 8, 13, 0.99));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.72), 0 0 24px rgba(255, 67, 19, 0.15), inset 0 0 0 1px rgba(255, 124, 54, 0.1);
  text-align: center;
}

.banned-access-crest {
  position: relative;
  display: grid;
  place-items: center;
  width: 156px;
  height: 156px;
  margin: -80px 0 8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 61, 25, 0.25), rgba(14, 8, 12, 0.08) 68%);
  filter: drop-shadow(0 10px 24px rgba(239, 51, 22, 0.28));
}

.banned-access-crest::before {
  position: absolute;
  inset: 8px;
  border: 7px solid #ec321f;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(10, 8, 11, 0.9), inset 0 0 16px rgba(255, 48, 25, 0.18), 0 0 16px rgba(255, 58, 28, 0.38);
  content: '';
}

.banned-access-crest img {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  object-fit: cover;
}

.banned-access-slash {
  position: absolute;
  top: 50%;
  left: 3px;
  width: 150px;
  height: 9px;
  border: 1px solid #ff6d43;
  border-radius: 9px;
  background: linear-gradient(180deg, #ff4d31, #c9151d);
  box-shadow: 0 0 8px rgba(255, 44, 27, 0.8);
  transform: rotate(-48deg);
}

.banned-access-alert {
  position: absolute;
  right: 17px;
  bottom: 1px;
  display: grid;
  width: 38px;
  height: 34px;
  place-items: center;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  background: #e72c21;
  color: #fff3e8;
  font-size: 18px;
  font-weight: 900;
  padding-top: 9px;
  filter: drop-shadow(0 0 6px rgba(255, 53, 30, 0.7));
}

.banned-access-card h1 {
  margin: 0;
  color: #f6f3f1;
  font-family: Manrope, sans-serif;
  font-size: clamp(2.5rem, 8vw, 3.65rem);
  font-style: italic;
  line-height: 1;
  letter-spacing: -0.07em;
  font-weight: 900;
  text-transform: none;
}

.banned-access-card h1 span {
  color: #f33c25;
}

.banned-access-subline {
  margin: 0;
  color: #f3efeb;
  font-size: 1.24rem;
  font-weight: 600;
  text-transform: none;
}

.banned-access-subline strong {
  color: #ff5b24;
  font-size: 1.3rem;
  font-weight: 800;
}

.banned-access-panel {
  width: 100%;
  display: grid;
  gap: 8px;
  margin-top: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(203, 54, 37, 0.5);
  border-radius: 12px;
  background: rgba(39, 13, 17, 0.48);
  box-shadow: inset 0 0 0 1px rgba(255, 194, 137, 0.04);
  text-align: left;
}

.banned-access-panel-header {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #ff443d;
  font-size: 0.86rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.banned-access-warning {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid currentColor;
  font-size: 0.9rem;
  font-weight: 900;
}

.banned-access-panel p {
  margin: 0;
  color: #f0e9e7;
  font-size: 0.96rem;
  line-height: 1.5;
}

.banned-signout-button {
  display: flex;
  width: 100%;
  min-height: 54px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
  border: none;
  border-radius: 28px;
  background: linear-gradient(180deg, #f13527 0%, #ca241e 100%);
  color: white;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  box-shadow: 0 10px 24px rgba(214, 42, 31, 0.3);
}

.banned-signout-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 32px rgba(214, 61, 31, 0.4);
}

.banned-signout-icon {
  font-size: 1.35rem;
  line-height: 1;
}

@media (max-width: 640px) {
  .banned-access-backdrop {
    width: min(100%, 420px);
  }

  .banned-access-card {
    padding: 24px 18px 20px;
  }

  .banned-access-crest {
    width: 132px;
    height: 132px;
    margin-top: -70px;
  }

  .banned-access-crest img {
    width: 94px;
    height: 94px;
  }
}
</style>
