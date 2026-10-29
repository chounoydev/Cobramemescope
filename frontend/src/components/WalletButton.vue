<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Settings2 } from '@lucide/vue'
import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import WalletHoldings from './WalletHoldings.vue'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import {
  checkUsernameAvailability,
  fetchAuthProfile,
  fetchReferralStats,
  fetchWalletBalance,
  loginWithEmail,
  recordWalletConnection,
  registerWithEmail,
  requestTrackedWalletChallenge,
  requestEvmWalletChallenge,
  requestWalletChallenge,
  saveAuthProfile,
  deleteAuthAccount,
  cancelAuthAccountDeletion,
  removeTrackedWalletLink,
  verifyEvmWalletLogin,
  verifyWalletLogin,
  verifyTrackedWalletLink,
  type AuthProfile,
} from '../lib/api'
import {
  currencyRateDate,
  currencyRateError,
  currencyRatesLoading,
  refreshCurrencyRates,
  selectedCurrency,
  selectedCountry,
  countryOptions,
  setSelectedCountry,
} from '../lib/currency'

type WalletSession = { address: string; token: string; authType?: string; username?: string; avatarSeed?: number } | null
type ProviderEvent = (...args: unknown[]) => void
type WalletType = 'evm' | 'solana' | ''
type WalletOption = { key: string; name: string; label: string; walletType: Exclude<WalletType, ''>; network: string; provider?: EvmProvider | SolanaProvider; downloadUrl: string }
type PendingSession = {
  address: string
  token: string
  authType: string
  walletName: string
  walletType: WalletType
  network: string
  profile: AuthProfile
  profileAvailable?: boolean
}
type PhantomDeepLinkState = {
  phase: 'connect' | 'sign'
  publicKey: string
  secretKey: string
  startedAt: number
  sharedKey?: string
  session?: string
  walletAddress?: string
  challenge?: { nonce: string; message: string }
}

const emit = defineEmits<{
  'wallet-session': [session: WalletSession]
  'wallet-signed-out': []
  'wallet-banned': [reason: string]
  'account-deleted': []
}>()

type EvmProvider = {
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  isBraveWallet?: boolean
  isPhantom?: boolean
  isRabby?: boolean
  isTrust?: boolean
  isBackpack?: boolean
  providers?: EvmProvider[]
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: ProviderEvent) => void
  removeListener?: (event: string, listener: ProviderEvent) => void
}
type AnnouncedEvmWallet = { uuid: string; name: string; provider: EvmProvider }

type SolanaProvider = {
  isPhantom?: boolean
  isSolflare?: boolean
  isBackpack?: boolean
  connect: () => Promise<{ publicKey?: { toString: () => string } }>
  signMessage?: (message: Uint8Array, display?: 'utf8' | 'hex') => Promise<{ signature: Uint8Array }>
  disconnect?: () => Promise<void>
  on?: (event: string, listener: ProviderEvent) => void
  removeListener?: (event: string, listener: ProviderEvent) => void
}

declare global {
  interface Window {
    ethereum?: EvmProvider
    coinbaseWalletExtension?: EvmProvider
    solana?: SolanaProvider
    phantom?: { ethereum?: EvmProvider; solana?: SolanaProvider }
    solflare?: SolanaProvider
    backpack?: { ethereum?: EvmProvider; solana?: SolanaProvider }
  }
}

const dialogOpen = ref(false)
const settingsMode = ref(false)
const deletePromptOpen = ref(false)
const deleteConfirmation = ref('')
const deletingAccount = ref(false)
const deletionScheduledAt = ref<string | null>(null)
const address = ref('')
const network = ref('')
const walletName = ref('')
const walletType = ref<WalletType>('')
const authType = ref('')
const errorMessage = ref('')
const copied = ref(false)
const connecting = ref(false)
const balanceLoading = ref(false)
const solBalance = ref<number | null>(null)
const balanceMessage = ref('')
const sessionToken = ref('')
const profileStorageAvailable = ref(true)
const profileAvatarData = ref('')
const username = ref('')
const usernameDraft = ref('')
const trackedWalletAddress = ref('')
const trackingWalletSaving = ref(false)
const trackingWalletMessage = ref('')
const linkWalletMode = ref(false)
const signupUsername = ref('')
const avatarSeed = ref(0)
const inviteCode = ref('')
const invitedCount = ref(0)
const inviteLoading = ref(false)
const inviteError = ref('')
const inviteNotice = ref('')
const profileSetup = ref(false)
const profileSaving = ref(false)
const emailAddress = ref('')
const emailPassword = ref('')
const confirmPassword = ref('')
const emailMode = ref<'signin' | 'signup'>('signup')
const usernameAvailability = ref<'idle' | 'checking' | 'available' | 'taken' | 'unavailable'>('idle')
const emailBusy = ref(false)
const moreWallets = ref(false)
const recentWalletKeys = ref<string[]>([])
const providerRefreshVersion = ref(0)
const pendingSession = ref<PendingSession | null>(null)
let usernameAvailabilityRequest = 0
let previousBodyOverflow: string | null = null
let previousDocumentOverflow: string | null = null
let androidBackButtonListener: PluginListenerHandle | null = null

function handleWalletDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') dialogOpen.value = false
}

watch(dialogOpen, async (isOpen) => {
  if (isOpen) {
    previousBodyOverflow = document.body.style.overflow
    previousDocumentOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    window.addEventListener('keydown', handleWalletDialogKeydown)
    if (Capacitor.isNativePlatform()) {
      androidBackButtonListener = await App.addListener('backButton', () => {
        dialogOpen.value = false
      })
      if (!dialogOpen.value) {
        await androidBackButtonListener.remove()
        androidBackButtonListener = null
      }
    }
    return
  }
  window.removeEventListener('keydown', handleWalletDialogKeydown)
  await androidBackButtonListener?.remove()
  androidBackButtonListener = null
  if (previousBodyOverflow !== null) document.body.style.overflow = previousBodyOverflow
  if (previousDocumentOverflow !== null) document.documentElement.style.overflow = previousDocumentOverflow
  previousBodyOverflow = null
  previousDocumentOverflow = null
})

const walletSessionTokenKey = 'memescope-wallet-token'
const walletSessionAddressKey = 'memescope-wallet-address'
const walletSessionMetadataKey = 'memescope-wallet-metadata'
const referralCodeStorageKey = 'memescope-pending-invite-code'
const recentWalletsKey = 'memescope-recent-wallets'
const localProfileKeyPrefix = 'memescope-wallet-profile:'
const phantomDeepLinkStateKey = 'memescope-phantom-deeplink'
const phantomBrowserHandoffKey = 'memescope-phantom-browser-handoff'
const phantomBrowserHandoffParameter = 'phantom_wallet'
const phantomCallbackParameters = ['phantom_callback', 'phantom_encryption_public_key', 'nonce', 'data', 'errorCode', 'errorMessage']
const phantomAppCallbackUrl = 'com.cobramemescope.app://phantom-callback'
const publicAppUrl = import.meta.env.VITE_PUBLIC_APP_URL || ''
const openLoginEventName = 'memescope:open-login'

const inviteLink = computed(() => {
  if (!inviteCode.value) return ''
  const url = new URL('/', publicAppUrl || window.location.origin)
  url.searchParams.set('ref', inviteCode.value)
  return url.toString()
})

function readReferralCode() {
  const fromUrl = new URL(window.location.href).searchParams.get('ref') || ''
  if (/^[a-f0-9]{24}$/.test(fromUrl)) localStorage.setItem(referralCodeStorageKey, fromUrl)
  const saved = localStorage.getItem(referralCodeStorageKey) || ''
  return /^[a-f0-9]{24}$/.test(saved) ? saved : ''
}

function clearReferralCode() {
  localStorage.removeItem(referralCodeStorageKey)
}

function readWalletSessionValue(key: string) {
  const saved = localStorage.getItem(key)
  if (saved !== null) {
    sessionStorage.removeItem(key)
    return saved
  }
  const legacy = sessionStorage.getItem(key)
  if (legacy !== null) {
    localStorage.setItem(key, legacy)
    sessionStorage.removeItem(key)
  }
  return legacy
}

function writeWalletSessionValue(key: string, value: string) {
  localStorage.setItem(key, value)
  sessionStorage.removeItem(key)
}

function removeWalletSessionValue(key: string) {
  localStorage.removeItem(key)
  sessionStorage.removeItem(key)
}

let activeEvm: EvmProvider | null = null
let activeSolana: SolanaProvider | null = null
let accountListener: ProviderEvent | null = null
let chainListener: ProviderEvent | null = null
const announcedEvmWallets: AnnouncedEvmWallet[] = []
let appUrlListener: PluginListenerHandle | null = null

const evmProviders = computed(() => {
  void providerRefreshVersion.value
  const injected = window.ethereum?.providers?.length ? window.ethereum.providers : window.ethereum ? [window.ethereum] : []
  const candidates = [
    ...injected.map((provider) => ({ provider, name: '' })),
    ...(window.coinbaseWalletExtension ? [{ provider: window.coinbaseWalletExtension, name: 'Coinbase Wallet' }] : []),
    ...announcedEvmWallets.map(({ provider, name }) => ({ provider, name })),
    ...(window.phantom?.ethereum ? [{ provider: window.phantom.ethereum, name: 'Phantom' }] : []),
    ...(window.backpack?.ethereum ? [{ provider: window.backpack.ethereum, name: 'Backpack' }] : []),
  ]
  const byName = new Map<string, EvmProvider>()
  for (const { provider, name: hint } of candidates) {
    const name = evmWalletName(provider, byName.size, hint)
    if (!byName.has(name)) byName.set(name, provider)
  }
  return [...byName.entries()].map(([name, provider]) => ({ name, provider }))
})

const solanaProviders = computed(() => {
  void providerRefreshVersion.value
  const candidates = [window.phantom?.solana, window.solflare, window.backpack?.solana, window.solana]
    .filter((provider): provider is SolanaProvider => Boolean(provider))
  const byName = new Map<string, SolanaProvider>()
  for (const provider of candidates) {
    const name = solanaWalletName(provider)
    if (!byName.has(name)) byName.set(name, provider)
  }
  return [...byName.entries()].map(([name, provider]) => ({ name, provider }))
})

const walletOptions = computed<WalletOption[]>(() => {
  const detected: WalletOption[] = [
    ...solanaProviders.value.map(({ name, provider }) => ({
      key: `solana:${name}`, name, label: name, walletType: 'solana' as const, network: 'Solana', provider,
      downloadUrl: name === 'Solflare' ? 'https://solflare.com/' : name === 'Backpack' ? 'https://backpack.app/' : 'https://phantom.app/download',
    })),
    ...evmProviders.value.map(({ name, provider }) => ({
      key: `evm:${name}`, name, label: name === 'Phantom' ? 'Phantom (EVM)' : name === 'Backpack' ? 'Backpack (EVM)' : name, walletType: 'evm' as const, network: 'Ethereum, Base and EVM networks', provider,
      downloadUrl: name === 'Coinbase Wallet' ? 'https://www.coinbase.com/wallet/downloads' : name === 'Rabby' ? 'https://rabby.io/' : name === 'Trust Wallet' ? 'https://trustwallet.com/download' : name === 'Phantom' ? 'https://phantom.app/download' : name === 'Backpack' ? 'https://backpack.app/' : 'https://metamask.io/download/',
    })),
  ]
  const catalog: WalletOption[] = [
    { key: 'solana:Phantom', name: 'Phantom', label: 'Phantom', walletType: 'solana', network: 'Solana', downloadUrl: 'https://phantom.app/download' },
    { key: 'evm:Coinbase Wallet', name: 'Coinbase Wallet', label: 'Coinbase Wallet', walletType: 'evm', network: 'Ethereum, Base and EVM networks', downloadUrl: 'https://www.coinbase.com/wallet/downloads' },
    { key: 'evm:MetaMask', name: 'MetaMask', label: 'MetaMask', walletType: 'evm', network: 'Ethereum, Base and EVM networks', downloadUrl: 'https://metamask.io/download/' },
    { key: 'solana:Solflare', name: 'Solflare', label: 'Solflare', walletType: 'solana', network: 'Solana', downloadUrl: 'https://solflare.com/' },
    { key: 'solana:Backpack', name: 'Backpack', label: 'Backpack', walletType: 'solana', network: 'Solana', downloadUrl: 'https://backpack.app/' },
    { key: 'evm:Backpack', name: 'Backpack', label: 'Backpack (EVM)', walletType: 'evm', network: 'Ethereum, Base and EVM networks', downloadUrl: 'https://backpack.app/' },
    { key: 'evm:Rabby', name: 'Rabby', label: 'Rabby', walletType: 'evm', network: 'Ethereum, Base and EVM networks', downloadUrl: 'https://rabby.io/' },
    { key: 'evm:Trust Wallet', name: 'Trust Wallet', label: 'Trust Wallet', walletType: 'evm', network: 'Ethereum, Base and EVM networks', downloadUrl: 'https://trustwallet.com/download' },
  ]
  const byKey = new Map(catalog.map((wallet) => [wallet.key, wallet]))
  for (const wallet of detected) byKey.set(wallet.key, { ...byKey.get(wallet.key), ...wallet })
  const recent = recentWalletKeys.value
  return [...byKey.values()].sort((left, right) => Number(recent.includes(right.key)) - Number(recent.includes(left.key)))
})
const primaryWallets = computed(() => ['solana:Phantom', 'evm:Coinbase Wallet'].map((key) => walletOptions.value.find((wallet) => wallet.key === key)).filter((wallet): wallet is WalletOption => Boolean(wallet)))
const additionalWallets = computed(() => walletOptions.value.filter((wallet) => !primaryWallets.value.some((primary) => primary.key === wallet.key)))
const detectedWalletOptions = computed(() => walletOptions.value.filter((wallet) => Boolean(wallet.provider)))
const shortenedAddress = computed(() => address.value ? `${address.value.slice(0, 6)}...${address.value.slice(-4)}` : '')
const avatarDataUrl = computed(() => profileAvatarData.value || makeAvatar(avatarSeed.value))

function makeAvatar(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
  const palettes: ReadonlyArray<readonly [string, string, string]> = [['#d9f47b', '#405a35', '#f6f6ed'], ['#b9d9ff', '#345477', '#fff9ea'], ['#f4c2a3', '#754738', '#f7ead8'], ['#d2c1fa', '#54427d', '#fcf8ea']]
  const palette = palettes[Math.floor(next() * palettes.length)] ?? ['#d9f47b', '#405a35', '#f6f6ed']
  const x = Math.floor(8 + next() * 32)
  const y = Math.floor(8 + next() * 32)
  const radius = Math.floor(7 + next() * 9)
  const rotate = Math.floor(next() * 90)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="${palette[0]}"/><circle cx="${x}" cy="${y}" r="${radius}" fill="${palette[1]}"/><path d="M5 38 Q24 ${Math.floor(13 + next() * 25)} 43 10 L48 48H0Z" fill="${palette[2]}" transform="rotate(${rotate} 24 24)"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function evmWalletName(provider: EvmProvider, index: number, hint = '') {
  const normalizedHint = hint.toLowerCase()
  if (normalizedHint.includes('coinbase')) return 'Coinbase Wallet'
  if (normalizedHint.includes('phantom')) return 'Phantom'
  if (normalizedHint.includes('brave')) return 'Brave Wallet'
  if (normalizedHint.includes('rabby')) return 'Rabby'
  if (normalizedHint.includes('trust')) return 'Trust Wallet'
  if (normalizedHint.includes('metamask')) return 'MetaMask'
  if (normalizedHint.includes('backpack')) return 'Backpack'
  if (provider.isBraveWallet) return 'Brave Wallet'
  if (provider.isCoinbaseWallet) return 'Coinbase Wallet'
  if (provider.isPhantom) return 'Phantom'
  if (provider.isRabby) return 'Rabby'
  if (provider.isTrust) return 'Trust Wallet'
  if (provider.isBackpack) return 'Backpack'
  if (provider.isMetaMask) return 'MetaMask'
  return hint.trim() || `Browser wallet ${index + 1}`
}

function networkName(chainId: string) {
  const knownNetworks: Record<string, string> = {
    '0x1': 'Ethereum',
    '0x89': 'Polygon',
    '0xa': 'Optimism',
    '0xa4b1': 'Arbitrum One',
    '0x2105': 'Base',
    '0xaa36a7': 'Sepolia testnet',
  }
  return knownNetworks[chainId.toLowerCase()] || `EVM chain ${Number.parseInt(chainId, 16) || chainId}`
}

function readRecentWallets() {
  try {
    const saved = JSON.parse(localStorage.getItem(recentWalletsKey) || '[]')
    return Array.isArray(saved) ? saved.filter((name): name is string => typeof name === 'string') : []
  } catch {
    return []
  }
}

function markWalletRecent(key: string) {
  const recent = [key, ...readRecentWallets().filter((item) => item !== key)].slice(0, 5)
  localStorage.setItem(recentWalletsKey, JSON.stringify(recent))
  recentWalletKeys.value = recent
}

function localProfileStorageKey(walletAddress: string) {
  return `${localProfileKeyPrefix}${walletAddress.toLowerCase()}`
}

function readLocalWalletProfile(walletAddress: string) {
  try {
    const saved = localStorage.getItem(localProfileStorageKey(walletAddress))
    if (!saved) return null
    const profile = JSON.parse(saved) as { username?: string; avatarDataUrl?: string }
    return {
      username: typeof profile.username === 'string' ? profile.username : '',
      avatarDataUrl: typeof profile.avatarDataUrl === 'string' ? profile.avatarDataUrl : '',
    }
  } catch {
    errorMessage.value = 'Could not read this wallet’s saved browser profile.'
    return null
  }
}

function saveLocalWalletProfile(walletAddress: string, usernameValue: string, avatarDataUrlValue: string) {
  localStorage.setItem(localProfileStorageKey(walletAddress), JSON.stringify({
    username: usernameValue,
    avatarDataUrl: avatarDataUrlValue,
  }))
}

async function selectProfilePicture(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  errorMessage.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    errorMessage.value = 'Choose a JPG, PNG, or WebP image.'
    input.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    errorMessage.value = 'Choose an image smaller than 5 MB.'
    input.value = ''
    return
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    const size = 256
    const scale = Math.min(size / image.width, size / image.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not process this image.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    profileAvatarData.value = canvas.toDataURL('image/jpeg', 0.82)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load this image.'
  } finally {
    URL.revokeObjectURL(objectUrl)
    input.value = ''
  }
}

function detachListeners() {
  if (activeEvm && accountListener) activeEvm.removeListener?.('accountsChanged', accountListener)
  if (activeEvm && chainListener) activeEvm.removeListener?.('chainChanged', chainListener)
  if (activeSolana && accountListener) activeSolana.removeListener?.('accountChanged', accountListener)
  accountListener = null
  chainListener = null
  activeEvm = null
  activeSolana = null
}

function clearConnection() {
  detachListeners()
  emit('wallet-session', null)
  removeWalletSessionValue(walletSessionTokenKey)
  removeWalletSessionValue(walletSessionAddressKey)
  removeWalletSessionValue(walletSessionMetadataKey)
  profileAvatarData.value = ''
  address.value = ''
  network.value = ''
  walletName.value = ''
  walletType.value = ''
  authType.value = ''
  sessionToken.value = ''
  deletionScheduledAt.value = null
  profileStorageAvailable.value = true
  username.value = ''
  usernameDraft.value = ''
  trackedWalletAddress.value = ''
  trackingWalletMessage.value = ''
  linkWalletMode.value = false
  avatarSeed.value = 0
  inviteCode.value = ''
  invitedCount.value = 0
  inviteError.value = ''
  inviteNotice.value = ''
  profileSetup.value = false
  pendingSession.value = null
  solBalance.value = null
  balanceMessage.value = ''
}

function readableError(error: unknown) {
  const code = (error as { code?: number })?.code
  if (code === 4001) return 'The request was declined. You can try again when ready.'
  if (error instanceof TypeError && /failed to fetch|network request failed/i.test(error.message)) {
    return 'Could not reach the Cobra MemeScope API. Check that the backend is running and the API URL is correct, then try again.'
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Could not sign in. Check your connection and try again.'
}

function handleBannedAccount(error: unknown) {
  const message = readableError(error)
  if (!/banned/i.test(message)) return false
  const reason = message
    .replace(/^This (?:account|wallet) is banned\.\s*/i, '')
    .replace(/^Reason:\s*/i, '')
    .trim()
  dialogOpen.value = false
  clearConnection()
  emit(
    'wallet-banned',
    !reason || /^No reason provided\.?$/i.test(reason)
      ? 'You have been banned due to a violation of our community rules and terms of service.'
      : reason,
  )
  return true
}

function isUnsupportedWalletPath(error: unknown) {
  const code = (error as { code?: number })?.code
  const message = error instanceof Error ? error.message : String(error || '')
  return code === -32601 || /unsupported path|unsupported method|method not supported/i.test(message)
}

function isPhantomMobileEnvironment() {
  const isIPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return Capacitor.isNativePlatform() || isIPadDesktopMode || /android|iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isAndroidBrowser() {
  return !Capacitor.isNativePlatform() && /android/i.test(navigator.userAgent)
}

async function refreshSolBalance(token = sessionToken.value) {
  if (!token || walletType.value !== 'solana') return false
  balanceMessage.value = ''
  balanceLoading.value = true
  try {
    const result = await fetchWalletBalance(token)
    if (result.walletAddress !== address.value) return false
    solBalance.value = result.sol
    return true
  } catch {
    balanceMessage.value = 'Balance unavailable'
    return false
  } finally {
    balanceLoading.value = false
  }
}

async function restoreWalletSession() {
  const token = readWalletSessionValue(walletSessionTokenKey) || ''
  const savedAddress = readWalletSessionValue(walletSessionAddressKey) || ''
  if (!token || !savedAddress) return
  let metadata: { authType?: string; walletName?: string; walletType?: WalletType; network?: string; profileAvailable?: boolean; avatarSeed?: number } = {}
  try {
    metadata = JSON.parse(readWalletSessionValue(walletSessionMetadataKey) || '{}')
  } catch {
    removeWalletSessionValue(walletSessionMetadataKey)
  }
  address.value = savedAddress
  walletName.value = metadata.walletName || 'Phantom'
  walletType.value = metadata.walletType || 'solana'
  network.value = metadata.network || 'Solana'
  authType.value = metadata.authType || 'wallet'
  sessionToken.value = token
  avatarSeed.value = metadata.avatarSeed || 0
  const localProfile = readLocalWalletProfile(savedAddress)
  profileAvatarData.value = localProfile?.avatarDataUrl || ''
  username.value = localProfile?.username || ''
  if (metadata.profileAvailable === false) {
    profileStorageAvailable.value = false
    if (!username.value) {
      const profile = { username: null, avatarSeed: avatarSeed.value }
      pendingSession.value = { address: savedAddress, token, authType: authType.value, walletName: walletName.value, walletType: walletType.value, network: network.value, profile, profileAvailable: false }
      usernameDraft.value = ''
      profileSetup.value = true
      dialogOpen.value = true
      return
    }
    if (walletType.value === 'solana') void refreshSolBalance(token)
    emit('wallet-session', { address: savedAddress, token, authType: authType.value, username: username.value, avatarSeed: avatarSeed.value })
    void loadReferralStats()
    return
  }
  try {
    const profile = await fetchAuthProfile(token)
    username.value = profile.username || localProfile?.username || ''
    avatarSeed.value = profile.avatarSeed
    trackedWalletAddress.value = profile.trackedWalletAddress || ''
    deletionScheduledAt.value = profile.deletionScheduledAt || null
    if (deletionScheduledAt.value) {
      settingsMode.value = true
      dialogOpen.value = true
      emit('wallet-session', null)
      return
    }
    if (!username.value) {
      pendingSession.value = { address: savedAddress, token, authType: authType.value, walletName: walletName.value, walletType: walletType.value, network: network.value, profile }
      profileSetup.value = true
      dialogOpen.value = true
      return
    }
    if (walletType.value === 'solana') void refreshSolBalance(token)
    emit('wallet-session', { address: savedAddress, token, authType: authType.value, username: username.value, avatarSeed: profile.avatarSeed })
    void loadReferralStats()
  } catch (error) {
    if (handleBannedAccount(error)) return
    errorMessage.value = readableError(error)
  }
}

async function checkAccountBanStatus() {
  const token = sessionToken.value
  if (!token) return

  try {
    await fetchAuthProfile(token)
  } catch (error) {
    if (sessionToken.value !== token) return
    if (handleBannedAccount(error)) return
    console.warn('Account status check failed:', readableError(error))
  }
}

async function completeSignIn(session: PendingSession) {
  clearConnection()
  clearReferralCode()
  address.value = session.address
  walletName.value = session.walletName
  walletType.value = session.walletType
  network.value = session.network
  authType.value = session.authType
  sessionToken.value = session.token
  avatarSeed.value = session.profile.avatarSeed
  deletionScheduledAt.value = session.profile.deletionScheduledAt || null
  profileStorageAvailable.value = session.profileAvailable !== false
  const localProfile = readLocalWalletProfile(session.address)
  profileAvatarData.value = localProfile?.avatarDataUrl || ''
  username.value = session.profile.username || localProfile?.username || ''
  trackedWalletAddress.value = session.profile.trackedWalletAddress || ''
  writeWalletSessionValue(walletSessionTokenKey, session.token)
  writeWalletSessionValue(walletSessionAddressKey, session.address)
  writeWalletSessionValue(walletSessionMetadataKey, JSON.stringify({
    authType: session.authType,
    walletName: session.walletName,
    walletType: session.walletType,
    network: session.network,
    profileAvailable: profileStorageAvailable.value,
    avatarSeed: session.profile.avatarSeed,
  }))
  if (deletionScheduledAt.value) {
    settingsMode.value = true
    dialogOpen.value = true
    emit('wallet-session', null)
    return
  }
  if (!username.value) {
    pendingSession.value = session
    usernameDraft.value = ''
    profileSetup.value = true
    return
  }
  publishSession(session.address, session.token, session.authType, { ...session.profile, username: username.value })
  if (session.walletType === 'solana') void refreshSolBalance(session.token)
}

function publishSession(sessionAddress: string, token: string, method: string, profile: AuthProfile) {
  deletionScheduledAt.value = null
  username.value = profile.username || ''
  avatarSeed.value = profile.avatarSeed
  trackedWalletAddress.value = profile.trackedWalletAddress || ''
  profileSetup.value = false
  dialogOpen.value = false
  emit('wallet-session', { address: sessionAddress, token, authType: method, username: profile.username || undefined, avatarSeed: profile.avatarSeed })
  void loadReferralStats()
}

async function finishProfileSetup() {
  if (!pendingSession.value || profileSaving.value) return
  errorMessage.value = ''
  profileSaving.value = true
  try {
    const chosenUsername = usernameDraft.value.trim()
    let profile: AuthProfile = { username: chosenUsername, avatarSeed: pendingSession.value.profile.avatarSeed }
    if (pendingSession.value.authType === 'wallet') {
      if (profileStorageAvailable.value) {
        try {
          profile = await saveAuthProfile(pendingSession.value.token, chosenUsername)
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (/already taken|already exists/i.test(message)) throw error
          profileStorageAvailable.value = false
          const metadata = JSON.parse(readWalletSessionValue(walletSessionMetadataKey) || '{}') as Record<string, unknown>
          writeWalletSessionValue(walletSessionMetadataKey, JSON.stringify({ ...metadata, profileAvailable: false }))
        }
      }
    } else {
      profile = await saveAuthProfile(pendingSession.value.token, chosenUsername)
    }
    saveLocalWalletProfile(pendingSession.value.address, chosenUsername, profileAvatarData.value)
    publishSession(pendingSession.value.address, pendingSession.value.token, pendingSession.value.authType, profile)
    pendingSession.value = null
  } catch (error) {
    errorMessage.value = readableError(error)
  } finally {
    profileSaving.value = false
  }
}

function editWalletProfile() {
  if (!address.value || !sessionToken.value) return
  settingsMode.value = false
  pendingSession.value = {
    address: address.value,
    token: sessionToken.value,
    authType: authType.value,
    walletName: walletName.value,
    walletType: walletType.value,
    network: network.value,
    profile: { username: username.value || null, avatarSeed: avatarSeed.value },
    profileAvailable: profileStorageAvailable.value,
  }
  usernameDraft.value = username.value
  profileSetup.value = true
  errorMessage.value = ''
}

function openSettings() {
  if (!address.value) return
  settingsMode.value = true
  deletePromptOpen.value = false
  deleteConfirmation.value = ''
  errorMessage.value = ''
  dialogOpen.value = true
  void loadReferralStats()
}

async function loadReferralStats() {
  if (!sessionToken.value || inviteLoading.value) return
  inviteLoading.value = true
  inviteError.value = ''
  inviteNotice.value = ''
  try {
    const stats = await fetchReferralStats(sessionToken.value)
    inviteCode.value = stats.inviteCode
    invitedCount.value = stats.invitedCount
  } catch (error) {
    inviteError.value = readableError(error)
  } finally {
    inviteLoading.value = false
  }
}

async function copyInviteLink() {
  if (!inviteLink.value) return
  inviteError.value = ''
  inviteNotice.value = ''
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    inviteNotice.value = 'Invite link copied. Share it with your friends.'
  } catch (error) {
    inviteError.value = error instanceof Error ? `Could not copy the invite link: ${error.message}` : 'Could not copy the invite link. Select and copy it manually.'
  }
}

async function deleteAccount() {
  if (!sessionToken.value || deleteConfirmation.value !== 'DELETE' || deletingAccount.value) return
  deletingAccount.value = true
  errorMessage.value = ''
  try {
    deletionScheduledAt.value = await deleteAuthAccount(sessionToken.value)
    emit('account-deleted')
    deletePromptOpen.value = false
    deleteConfirmation.value = ''
    await disconnectWallet()
  } catch (error) {
    errorMessage.value = readableError(error)
  } finally {
    deletingAccount.value = false
  }
}

async function cancelAccountDeletion() {
  if (!sessionToken.value || deletingAccount.value) return
  deletingAccount.value = true
  errorMessage.value = ''
  try {
    await cancelAuthAccountDeletion(sessionToken.value)
    publishSession(address.value, sessionToken.value, authType.value, {
      username: username.value || null,
      avatarSeed: avatarSeed.value,
      trackedWalletAddress: trackedWalletAddress.value || null,
    })
    settingsMode.value = false
  } catch (error) {
    errorMessage.value = readableError(error)
  } finally {
    deletingAccount.value = false
  }
}

async function linkWalletToAccount(wallet: WalletOption) {
  if (!sessionToken.value || authType.value !== 'email' || trackingWalletSaving.value) return
  trackingWalletSaving.value = true
  trackingWalletMessage.value = ''
  errorMessage.value = ''
  try {
    if (!wallet.provider) throw new Error(`${wallet.name} is not detected. Install or unlock it, then refresh Cobra MemeScope.`)

    if (wallet.walletType === 'evm') {
      if (!('request' in wallet.provider)) throw new Error(`${wallet.name} does not support EVM wallet connections.`)
      const provider = wallet.provider
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
      if (!accounts?.[0]) throw new Error('No account was selected.')
      const chainId = await provider.request({ method: 'eth_chainId' }) as string
      const challenge = await requestTrackedWalletChallenge(sessionToken.value, accounts[0], 'evm', Number.parseInt(chainId, 16))
      const signature = await provider.request({ method: 'personal_sign', params: [challenge.message, accounts[0]] }) as string
      trackedWalletAddress.value = await verifyTrackedWalletLink(sessionToken.value, accounts[0], 'evm', challenge.nonce, signature)
    } else {
      if (!('connect' in wallet.provider)) throw new Error(`${wallet.name} does not support Solana wallet connections.`)
      const provider = wallet.provider
      if (!provider.signMessage) throw new Error(`${wallet.name} does not support message signing in this browser.`)
      const result = await provider.connect()
      if (!result.publicKey) throw new Error('No account was selected.')
      const walletAddress = result.publicKey.toString()
      const challenge = await requestTrackedWalletChallenge(sessionToken.value, walletAddress, 'solana')
      const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), 'utf8')
      if (!signed.signature?.length) throw new Error(`${wallet.name} did not return a signature.`)
      trackedWalletAddress.value = await verifyTrackedWalletLink(sessionToken.value, walletAddress, 'solana', challenge.nonce, Array.from(signed.signature))
    }

    trackingWalletMessage.value = 'Wallet linked. Token balances will refresh automatically.'
    linkWalletMode.value = false
    markWalletRecent(wallet.key)
  } catch (error) {
    errorMessage.value = readableError(error)
  } finally {
    trackingWalletSaving.value = false
  }
}

async function unlinkTrackedWallet() {
  if (!sessionToken.value || authType.value !== 'email' || trackingWalletSaving.value) return
  trackingWalletSaving.value = true
  trackingWalletMessage.value = ''
  errorMessage.value = ''
  try {
    await removeTrackedWalletLink(sessionToken.value)
    trackedWalletAddress.value = ''
    linkWalletMode.value = false
    trackingWalletMessage.value = 'Wallet unlinked.'
  } catch (error) {
    errorMessage.value = readableError(error)
  } finally {
    trackingWalletSaving.value = false
  }
}

async function connectEvm(provider: EvmProvider, name: string) {
  errorMessage.value = ''
  connecting.value = true
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
    if (!accounts?.[0]) throw new Error('No account was selected.')
    const chainId = await provider.request({ method: 'eth_chainId' }) as string
    const challenge = await requestEvmWalletChallenge(accounts[0], Number.parseInt(chainId, 16))
    const signature = await provider.request({ method: 'personal_sign', params: [challenge.message, accounts[0]] }) as string
    const result = await verifyEvmWalletLogin(accounts[0], challenge.nonce, signature, readReferralCode())
    await completeSignIn({ address: accounts[0], token: result.token, authType: 'wallet', walletName: name, walletType: 'evm', network: networkName(chainId), profile: result.profile, profileAvailable: result.profileAvailable })
    markWalletRecent(`evm:${name}`)
    void recordWalletConnection(accounts[0]).catch(() => undefined)
    activeEvm = provider
    accountListener = (...args) => {
      const nextAccounts = args[0] as string[] | undefined
      if (!nextAccounts?.[0] || nextAccounts[0].toLowerCase() !== address.value.toLowerCase()) clearConnection()
    }
    chainListener = (...args) => { network.value = networkName(String(args[0] || '')) }
    provider.on?.('accountsChanged', accountListener)
    provider.on?.('chainChanged', chainListener)
  } catch (error) {
    if (handleBannedAccount(error)) return
    errorMessage.value = readableError(error)
  } finally {
    connecting.value = false
  }
}

async function connectSolana(provider: SolanaProvider, name: string) {
  errorMessage.value = ''
  connecting.value = true
  try {
    if (!provider.signMessage) {
      if (name === 'Phantom' && isPhantomMobileEnvironment()) {
        if (sessionStorage.getItem(phantomBrowserHandoffKey)) {
          throw new Error('Phantom did not enable message signing. Reload Cobra MemeScope in Phantom’s in-app browser and try again.')
        }
        startPhantomMobileConnection()
        return
      }
      throw new Error(`${name} does not support message signing in this browser.`)
    }
    const result = await provider.connect()
    if (!result.publicKey) throw new Error('No account was selected.')
    const walletAddress = result.publicKey.toString()
    const challenge = await requestWalletChallenge(walletAddress)
    const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), 'utf8')
    if (!signed.signature?.length) throw new Error(`${name} did not return a signature.`)
    const session = await verifyWalletLogin(walletAddress, challenge.nonce, Array.from(signed.signature), readReferralCode())
    await completeSignIn({ address: walletAddress, token: session.token, authType: 'wallet', walletName: name, walletType: 'solana', network: 'Solana', profile: session.profile, profileAvailable: session.profileAvailable })
    if (name === 'Phantom') sessionStorage.removeItem(phantomBrowserHandoffKey)
    markWalletRecent(`solana:${name}`)
    void recordWalletConnection(walletAddress).catch(() => undefined)
    activeSolana = provider
    accountListener = (...args) => {
      const nextPublicKey = args[0] as { toString: () => string } | null | undefined
      if (!nextPublicKey || nextPublicKey.toString() !== address.value) clearConnection()
    }
    provider.on?.('accountChanged', accountListener)
  } catch (error) {
    if (handleBannedAccount(error)) return
    if (name === 'Phantom' && isPhantomMobileEnvironment() && isUnsupportedWalletPath(error) && !sessionStorage.getItem(phantomBrowserHandoffKey)) {
      startPhantomMobileConnection()
    } else {
      errorMessage.value = readableError(error)
    }
  } finally {
    connecting.value = false
  }
}

async function finishEmailAuth() {
  if (emailBusy.value) return
  errorMessage.value = ''
  let submittedUsername = ''
  if (emailMode.value === 'signup') {
    submittedUsername = signupUsername.value.trim()
    if (!/^[A-Za-z0-9_]{3,24}$/.test(submittedUsername)) {
      errorMessage.value = 'Username must be 3–24 characters using letters, numbers, or underscores.'
      return
    }
    if (emailPassword.value !== confirmPassword.value) {
      errorMessage.value = 'The passwords do not match.'
      return
    }
  }
  emailBusy.value = true
  try {
    if (emailMode.value === 'signup' && usernameAvailability.value !== 'available') {
      const available = await checkSignupUsername(submittedUsername)
      if (submittedUsername !== signupUsername.value.trim()) {
        errorMessage.value = 'Username changed while it was being checked. Please submit again.'
        return
      }
      if (available === false) {
        errorMessage.value = 'That username is already taken. Choose another one.'
        return
      }
    }
    const result = emailMode.value === 'signup'
      ? await registerWithEmail(emailAddress.value, emailPassword.value, signupUsername.value.trim(), readReferralCode())
      : await loginWithEmail(emailAddress.value, emailPassword.value)
    await completeSignIn({ address: result.email, token: result.token, authType: 'email', walletName: 'Email', walletType: '', network: result.email, profile: result.profile })
    emailPassword.value = ''
    confirmPassword.value = ''
  } catch (error) {
    if (handleBannedAccount(error)) return
    errorMessage.value = readableError(error)
    if (emailMode.value === 'signup' && /username.*already taken/i.test(errorMessage.value)) {
      usernameAvailability.value = 'taken'
    }
  } finally {
    emailBusy.value = false
  }
}

function resetUsernameAvailability() {
  usernameAvailabilityRequest++
  usernameAvailability.value = 'idle'
}

async function checkSignupUsername(username = signupUsername.value.trim()): Promise<boolean | null> {
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    usernameAvailability.value = 'idle'
    return false
  }
  const request = ++usernameAvailabilityRequest
  usernameAvailability.value = 'checking'
  try {
    const available = await checkUsernameAvailability(username)
    if (request !== usernameAvailabilityRequest || username !== signupUsername.value.trim()) return null
    usernameAvailability.value = available ? 'available' : 'taken'
    return available
  } catch {
    if (request !== usernameAvailabilityRequest || username !== signupUsername.value.trim()) return null
    usernameAvailability.value = 'unavailable'
    return null
  }
}

function toggleEmailMode() {
  emailMode.value = emailMode.value === 'signin' ? 'signup' : 'signin'
  resetUsernameAvailability()
}

function openConnectDialog() {
  dialogOpen.value = true
  profileSetup.value = false
  settingsMode.value = Boolean(deletionScheduledAt.value)
  errorMessage.value = ''
  requestInjectedWallets()
  if (address.value && !deletionScheduledAt.value) void loadReferralStats()
}

function handleOpenLoginRequest() {
  openConnectDialog()
}

function handleAnnouncedEvmWallet(event: Event) {
  const detail = (event as CustomEvent<{ info?: { uuid?: string; name?: string }; provider?: EvmProvider }>).detail
  if (!detail?.info?.uuid || !detail.info.name || typeof detail.provider?.request !== 'function') return
  if (announcedEvmWallets.some((wallet) => wallet.uuid === detail.info?.uuid)) return
  announcedEvmWallets.push({ uuid: detail.info.uuid, name: detail.info.name, provider: detail.provider })
  providerRefreshVersion.value++
}

function requestInjectedWallets() {
  providerRefreshVersion.value++
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

function cleanPhantomCallbackUrl() {
  const callbackUrl = new URL(window.location.href)
  for (const parameter of phantomCallbackParameters) callbackUrl.searchParams.delete(parameter)
  window.history.replaceState(window.history.state, '', callbackUrl)
}

function phantomRedirectUrl(phase: PhantomDeepLinkState['phase']) {
  if (Capacitor.isNativePlatform()) {
    const callbackUrl = new URL(phantomAppCallbackUrl)
    callbackUrl.searchParams.set('phantom_callback', phase)
    return callbackUrl.toString()
  }
  const callbackUrl = new URL(window.location.href)
  for (const parameter of phantomCallbackParameters) callbackUrl.searchParams.delete(parameter)
  callbackUrl.searchParams.set('phantom_callback', phase)
  return callbackUrl.toString()
}

function savePhantomDeepLinkState(state: PhantomDeepLinkState) {
  sessionStorage.setItem(phantomDeepLinkStateKey, JSON.stringify(state))
}

function makePhantomDeepLink(method: 'connect' | 'signMessage', parameters: Record<string, string>) {
  const url = new URL(`https://phantom.com/ul/v1/${method}`)
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  window.location.assign(url.toString())
}

function openPhantomInAppBrowser(appUrl: URL) {
  const targetUrl = new URL(appUrl.origin)
  targetUrl.searchParams.set(phantomBrowserHandoffParameter, '1')
  const deepLink = new URL(`https://phantom.com/ul/browse/${encodeURIComponent(targetUrl.toString())}`)
  deepLink.searchParams.set('ref', appUrl.origin)
  window.location.assign(deepLink.toString())
}

function startPhantomMobileConnection() {
  const isMobile = isPhantomMobileEnvironment()
  const appUrl = new URL(publicAppUrl || window.location.origin)
  if (!isMobile) {
    errorMessage.value = 'Phantom was not detected. Install or unlock the Phantom browser extension, then try again.'
    return
  }
  if (appUrl.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(appUrl.hostname)) {
    errorMessage.value = 'Phantom mobile sign-in needs the public HTTPS site URL. Set VITE_PUBLIC_APP_URL to that URL, rebuild the Android app, then try again.'
    return
  }

  if (isAndroidBrowser()) {
    openPhantomInAppBrowser(appUrl)
    return
  }

  const keyPair = nacl.box.keyPair()
  const state: PhantomDeepLinkState = {
    phase: 'connect',
    publicKey: bs58.encode(keyPair.publicKey),
    secretKey: bs58.encode(keyPair.secretKey),
    startedAt: Date.now(),
  }
  savePhantomDeepLinkState(state)
  makePhantomDeepLink('connect', {
    app_url: appUrl.origin,
    dapp_encryption_public_key: state.publicKey,
    redirect_link: phantomRedirectUrl('connect'),
    cluster: 'mainnet-beta',
  })
}

function decryptPhantomResponse(data: string, nonce: string, sharedKey: Uint8Array) {
  const decrypted = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedKey)
  if (!decrypted) throw new Error('Phantom returned a response that could not be decrypted. Reconnect and try again.')
  return JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, unknown>
}

function encryptPhantomRequest(payload: Record<string, string>, sharedKey: Uint8Array) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const encrypted = nacl.box.after(new TextEncoder().encode(JSON.stringify(payload)), nonce, sharedKey)
  return { nonce: bs58.encode(nonce), payload: bs58.encode(encrypted) }
}

async function resumePhantomDeepLink(returnedUrl = window.location.href) {
  const callbackUrl = new URL(returnedUrl)
  const phase = callbackUrl.searchParams.get('phantom_callback')
  if (phase !== 'connect' && phase !== 'sign') return false

  const stateText = sessionStorage.getItem(phantomDeepLinkStateKey)
  if (returnedUrl === window.location.href) cleanPhantomCallbackUrl()
  if (!stateText) {
    errorMessage.value = 'The Phantom connection expired. Start the wallet connection again.'
    dialogOpen.value = true
    return true
  }

  try {
    const state = JSON.parse(stateText) as PhantomDeepLinkState
    if (state.phase !== phase || Date.now() - state.startedAt > 30 * 60 * 1000) {
      throw new Error('The Phantom connection expired. Start the wallet connection again.')
    }
    const errorCode = callbackUrl.searchParams.get('errorCode')
    if (errorCode) {
      const walletError = callbackUrl.searchParams.get('errorMessage')
      throw new Error(walletError || 'The Phantom wallet request was declined.')
    }
    const nonce = callbackUrl.searchParams.get('nonce')
    const data = callbackUrl.searchParams.get('data')
    if (!nonce || !data) throw new Error('Phantom returned an incomplete connection response.')

    const secretKey = bs58.decode(state.secretKey)
    if (phase === 'connect') {
      const phantomPublicKey = callbackUrl.searchParams.get('phantom_encryption_public_key')
      if (!phantomPublicKey) throw new Error('Phantom did not return its connection key.')
      const sharedKey = nacl.box.before(bs58.decode(phantomPublicKey), secretKey)
      const result = decryptPhantomResponse(data, nonce, sharedKey)
      const publicKey = String(result.public_key || '')
      const phantomSession = String(result.session || '')
      if (!publicKey || !phantomSession) throw new Error('Phantom returned an invalid connection response.')
      const challenge = await requestWalletChallenge(publicKey)
      const nextState: PhantomDeepLinkState = {
        ...state,
        phase: 'sign',
        sharedKey: bs58.encode(sharedKey),
        session: phantomSession,
        walletAddress: publicKey,
        challenge,
      }
      savePhantomDeepLinkState(nextState)
      const encrypted = encryptPhantomRequest({
        message: bs58.encode(new TextEncoder().encode(challenge.message)),
        session: phantomSession,
        display: 'utf8',
      }, sharedKey)
      makePhantomDeepLink('signMessage', {
        dapp_encryption_public_key: state.publicKey,
        nonce: encrypted.nonce,
        redirect_link: phantomRedirectUrl('sign'),
        payload: encrypted.payload,
      })
      return true
    }

    if (!state.sharedKey || !state.walletAddress || !state.challenge) throw new Error('The Phantom signing session is incomplete. Reconnect and try again.')
    const signed = decryptPhantomResponse(data, nonce, bs58.decode(state.sharedKey))
    const signature = String(signed.signature || '')
    if (!signature) throw new Error('Phantom did not return a message signature.')
    sessionStorage.removeItem(phantomDeepLinkStateKey)
    const session = await verifyWalletLogin(state.walletAddress, state.challenge.nonce, Array.from(bs58.decode(signature)), readReferralCode())
    await completeSignIn({
      address: state.walletAddress,
      token: session.token,
      authType: 'wallet',
      walletName: 'Phantom',
      walletType: 'solana',
      network: 'Solana',
      profile: session.profile,
      profileAvailable: session.profileAvailable,
    })
    markWalletRecent('solana:Phantom')
    void recordWalletConnection(state.walletAddress).catch(() => undefined)
    void refreshSolBalance(session.token)
    return true
  } catch (error) {
    sessionStorage.removeItem(phantomDeepLinkStateKey)
    if (handleBannedAccount(error)) return true
    errorMessage.value = readableError(error)
    dialogOpen.value = true
    return true
  }
}

function connectDetectedWallet(wallet: WalletOption) {
  if (wallet.walletType === 'solana') {
    const currentProvider = [window.phantom?.solana, window.solflare, window.backpack?.solana, window.solana]
      .filter((provider): provider is SolanaProvider => Boolean(provider))
      .find((provider) => solanaWalletName(provider) === wallet.name)
    if (currentProvider) {
      void connectSolana(currentProvider, wallet.name)
      return
    }
    if (wallet.name === 'Phantom') {
      if (sessionStorage.getItem(phantomBrowserHandoffKey)) {
        errorMessage.value = 'Phantom did not provide its Solana wallet. Reload Cobra MemeScope in Phantom’s in-app browser and try again.'
        return
      }
      if (isPhantomMobileEnvironment()) {
        startPhantomMobileConnection()
      } else {
        errorMessage.value = 'Phantom extension not detected. Install or unlock Phantom in Chrome or Edge, then refresh Cobra MemeScope and try again.'
      }
      return
    }
    errorMessage.value = `${wallet.name} is not detected. Install or unlock the wallet extension, then refresh Cobra MemeScope and try again.`
    return
  }
  if (!wallet.provider) {
    errorMessage.value = `${wallet.name} is not detected. Install or unlock the wallet extension, then refresh Cobra MemeScope and try again.`
    return
  }
  if ('request' in wallet.provider) void connectEvm(wallet.provider, wallet.name)
}

function solanaWalletName(provider: SolanaProvider) {
  if (provider.isPhantom) return 'Phantom'
  if (provider.isSolflare) return 'Solflare'
  if (provider.isBackpack) return 'Backpack'
  return 'Solana wallet'
}

async function disconnectWallet() {
  const solana = activeSolana
  settingsMode.value = false
  dialogOpen.value = false
  emit('wallet-signed-out')
  clearConnection()
  if (solana?.disconnect) await solana.disconnect().catch(() => undefined)
}

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(address.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1500)
  } catch {
    errorMessage.value = 'Could not copy the address. Select and copy it manually.'
  }
}

function handleCountryChange(event: Event) {
  setSelectedCountry((event.target as HTMLSelectElement).value)
}

let accountStatusTimer: number | undefined

onMounted(() => {
  readReferralCode()
  window.addEventListener(openLoginEventName, handleOpenLoginRequest)
  recentWalletKeys.value = readRecentWallets()
  void refreshCurrencyRates().catch((error) => console.error('Currency exchange rate refresh failed:', error))
  const callbackUrl = new URL(window.location.href)
  if (callbackUrl.searchParams.get(phantomBrowserHandoffParameter) === '1') {
    sessionStorage.setItem(phantomBrowserHandoffKey, '1')
    callbackUrl.searchParams.delete(phantomBrowserHandoffParameter)
    window.history.replaceState(window.history.state, '', callbackUrl)
    dialogOpen.value = true
  }
  window.addEventListener('eip6963:announceProvider', handleAnnouncedEvmWallet)
  window.addEventListener('ethereum#initialized', requestInjectedWallets)
  requestInjectedWallets()
  void (async () => {
    if (Capacitor.isNativePlatform()) {
      appUrlListener = await App.addListener('appUrlOpen', ({ url }) => {
        void resumePhantomDeepLink(url)
      })
    }
    if (!(await resumePhantomDeepLink())) await restoreWalletSession()
  })()
  accountStatusTimer = window.setInterval(() => { void checkAccountBanStatus() }, 60_000)
})
onBeforeUnmount(() => {
  window.clearInterval(accountStatusTimer)
  window.removeEventListener('keydown', handleWalletDialogKeydown)
  void androidBackButtonListener?.remove()
  androidBackButtonListener = null
  if (previousBodyOverflow !== null) document.body.style.overflow = previousBodyOverflow
  if (previousDocumentOverflow !== null) document.documentElement.style.overflow = previousDocumentOverflow
  window.removeEventListener(openLoginEventName, handleOpenLoginRequest)
  window.removeEventListener('eip6963:announceProvider', handleAnnouncedEvmWallet)
  window.removeEventListener('ethereum#initialized', requestInjectedWallets)
  detachListeners()
  void appUrlListener?.remove()
  appUrlListener = null
})
</script>

<template>
  <div class="wallet-controls">
    <button class="wallet-button" type="button" :aria-expanded="dialogOpen" @click="openConnectDialog">
      <img v-if="username" :src="avatarDataUrl" alt="" />
      <span v-else>◈</span>{{ deletionScheduledAt ? 'Deletion pending' : username || (address ? shortenedAddress : 'Sign in') }}
    </button>
  </div>

  <Teleport to="body">
  <div v-if="dialogOpen" class="wallet-backdrop" @click.self="dialogOpen = false">
    <section class="wallet-dialog" :class="{ 'auth-dialog': !address && !profileSetup && !settingsMode }" role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title">
      <header class="dialog-header">
        <div class="dialog-title-block">
          <div class="dialog-brand" v-if="!address && !profileSetup && !settingsMode">
            <img src="/mascot-logo.png" alt="" />
            <span><strong>COBRA</strong><small>MEMESCOPE</small></span>
          </div>
          <span class="dialog-eyebrow">{{ settingsMode ? 'ACCOUNT PREFERENCES' : profileSetup ? 'YOUR PROFILE' : 'COBRA MEMESCOPE ACCOUNT' }}</span>
          <h2 id="wallet-dialog-title" :class="{ 'connected-title': address && !profileSetup }">{{ settingsMode ? 'Settings' : profileSetup ? (username ? 'Edit your profile' : 'Choose a username') : address ? 'Account connected' : emailMode === 'signup' ? 'Create your account' : 'Welcome back' }}</h2>
        </div>
        <div class="dialog-header-actions">
          <button v-if="settingsMode && !deletionScheduledAt" class="settings-back-button" type="button" @click="settingsMode = false">‹ Profile</button>
          <button v-if="address && !profileSetup" class="account-settings-button" type="button" aria-label="Account settings" title="Account settings" :aria-expanded="settingsMode" @click="openSettings"><Settings2 :size="17" :stroke-width="1.8" /></button>
          <button class="dialog-close" type="button" aria-label="Close dialog" @click="dialogOpen = false">×</button>
        </div>
      </header>

      <template v-if="settingsMode">
        <p class="settings-description">Manage your public profile, app appearance, and account data.</p>
        <div class="settings-profile">
          <img class="connected-avatar" :src="avatarDataUrl" alt="" />
          <div class="connected-details"><strong>{{ username || 'Your profile' }}</strong><span>{{ address }}</span></div>
          <button v-if="!deletionScheduledAt" class="secondary-action" type="button" @click="editWalletProfile">Edit profile</button>
        </div>
        <section class="currency-preference" aria-labelledby="display-currency-title">
          <div>
            <strong id="display-currency-title">Display currency</strong>
            <small>Choose a country to set the currency used for market values.</small>
          </div>
          <label class="currency-select country-select">
            <span aria-hidden="true">{{ countryOptions.find((option) => option.code === selectedCountry)?.flag }}</span>
            <select :value="selectedCountry" aria-label="Country and display currency" @change="handleCountryChange">
              <option v-for="option in countryOptions" :key="option.code" :value="option.code">{{ option.flag }} {{ option.country }} · {{ option.currency }}</option>
            </select>
          </label>
          <div class="currency-rate-footer">
            <small v-if="currencyRateDate">Rates dated {{ currencyRateDate }}</small>
            <small v-else>Exchange rate data has not loaded yet.</small>
            <button type="button" :disabled="currencyRatesLoading" @click="refreshCurrencyRates().catch((error) => console.error('Currency exchange rate refresh failed:', error))">{{ currencyRatesLoading ? 'Updating…' : 'Refresh rates' }}</button>
          </div>
          <p v-if="currencyRateError" class="currency-rate-error" role="status">{{ currencyRateError }}<span v-if="selectedCurrency !== 'USD'"> Existing saved rates will be used when available.</span></p>
        </section>
        <section class="delete-account-panel">
          <span class="delete-account-eyebrow">DANGER ZONE</span>
          <strong>Delete account</strong>
          <p v-if="deletionScheduledAt">This account is deactivated and will be permanently deleted on {{ new Date(deletionScheduledAt).toLocaleString() }}. Cancel before then to restore access.</p>
          <p v-else>Deactivate this account now. Its saved profile and watchlist data will be permanently deleted after a 3-day grace period. You can cancel during that period.</p>
          <button v-if="deletionScheduledAt" class="secondary-action" type="button" :disabled="deletingAccount" @click="cancelAccountDeletion">{{ deletingAccount ? 'Restoring…' : 'Cancel scheduled deletion' }}</button>
          <button v-if="deletionScheduledAt" class="disconnect-action" type="button" :disabled="deletingAccount" @click="disconnectWallet">Sign out</button>
          <button v-else-if="!deletePromptOpen" class="delete-account-trigger" type="button" @click="deletePromptOpen = true">Delete account</button>
          <form v-else class="delete-confirm-form" @submit.prevent="deleteAccount">
            <label for="delete-account-confirmation">Type <b>DELETE</b> to confirm</label>
            <input id="delete-account-confirmation" v-model="deleteConfirmation" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE" />
            <div class="delete-confirm-actions">
              <button class="secondary-action" type="button" :disabled="deletingAccount" @click="deletePromptOpen = false; deleteConfirmation = ''">Cancel</button>
              <button class="delete-account-trigger" type="submit" :disabled="deleteConfirmation !== 'DELETE' || deletingAccount">{{ deletingAccount ? 'Scheduling…' : 'Schedule deletion' }}</button>
            </div>
          </form>
        </section>
      </template>

      <template v-else-if="profileSetup">
        <div class="profile-preview">
          <img :src="avatarDataUrl" alt="Profile picture preview" />
          <span><strong>Your profile picture</strong><small>Keep your generated avatar or upload your own.</small></span>
        </div>
        <form class="profile-form" @submit.prevent="finishProfileSetup">
          <label for="profile-username">USERNAME</label>
          <input id="profile-username" v-model="usernameDraft" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocomplete="username" placeholder="Choose a username" required />
          <small>3–24 letters, numbers, or underscores. Usernames are public.</small>
          <label for="profile-picture">PROFILE PICTURE</label>
          <input id="profile-picture" type="file" accept="image/jpeg,image/png,image/webp" @change="selectProfilePicture" />
          <small>Your picture is resized and saved only in this browser. JPG, PNG, or WebP; up to 5 MB.</small>
          <button class="profile-submit" type="submit" :disabled="profileSaving || usernameDraft.trim().length < 3">{{ profileSaving ? 'Saving profile…' : username ? 'Save profile' : 'Continue' }}</button>
        </form>
      </template>

      <template v-else-if="address">
        <div class="connected-wallet">
          <img class="connected-avatar" :src="avatarDataUrl" alt="" />
          <div class="connected-details"><strong>{{ username || walletName }}</strong><span>{{ walletName }} · {{ network }}</span></div>
          <span class="address-short">{{ walletType ? shortenedAddress : '' }}</span>
        </div>
        <section v-if="!deletionScheduledAt" class="invite-preference" aria-labelledby="invite-link-title">
          <div class="invite-preference-heading">
            <div><span class="invite-eyebrow">YOUR PROFILE LINK</span><strong id="invite-link-title">Invite friends</strong><small>Share your unique link and track successful sign-ups.</small></div>
            <span class="invite-count"><strong>{{ invitedCount }}</strong><small>INVITED</small></span>
          </div>
          <div class="invite-link-row">
            <input :value="inviteLoading ? 'Loading your invite link…' : inviteLink || (inviteError ? 'Invite link could not be loaded' : 'Preparing your invite link…')" aria-label="Your personal invite link" readonly />
            <button type="button" :disabled="inviteLoading || !inviteLink" @click="copyInviteLink">{{ inviteLoading ? 'LOADING…' : 'COPY LINK' }}</button>
          </div>
          <button v-if="inviteError && !inviteCode" type="button" class="invite-retry" :disabled="inviteLoading" @click="loadReferralStats">RETRY LOADING INVITE LINK</button>
          <p v-if="inviteError" class="invite-message invite-error" role="alert">{{ inviteError }}</p>
          <p v-else-if="inviteNotice" class="invite-message invite-success" role="status">{{ inviteNotice }}</p>
        </section>
        <div v-if="walletType" class="full-address">{{ address }}</div>
        <section v-if="authType === 'email'" class="tracked-wallet-form">
          <div class="tracked-wallet-heading">
            <div><label>OWNER WALLET</label><p>Link your wallet to view meme-token balances across Solana and supported EVM networks.</p></div>
            <span v-if="trackedWalletAddress" class="linked-wallet-badge">LINKED</span>
          </div>
          <div v-if="trackedWalletAddress" class="tracked-wallet-linked">
            <span>{{ `${trackedWalletAddress.slice(0, 7)}…${trackedWalletAddress.slice(-5)}` }}</span>
            <button type="button" :disabled="trackingWalletSaving" @click="unlinkTrackedWallet">{{ trackingWalletSaving ? 'Please wait…' : 'Unlink' }}</button>
          </div>
          <button v-if="trackedWalletAddress && !linkWalletMode" class="tracked-wallet-change" type="button" @click="linkWalletMode = true">Connect a different wallet</button>
          <div v-if="!trackedWalletAddress || linkWalletMode" class="tracked-wallet-options">
            <p class="wallet-signature-note">Choose a wallet and sign a message to prove ownership. No transaction or token approval.</p>
            <button v-for="wallet in detectedWalletOptions" :key="wallet.key" class="tracked-wallet-choice" type="button" :disabled="trackingWalletSaving" @click="linkWalletToAccount(wallet)">
              <span class="tracked-wallet-icon">{{ wallet.walletType === 'solana' ? 'S' : 'E' }}</span>
              <span>{{ wallet.label }}<small>{{ trackingWalletSaving ? 'Waiting for wallet…' : `Connect ${wallet.walletType === 'solana' ? 'Solana' : 'EVM'} wallet` }}</small></span>
              <b>↗</b>
            </button>
            <p v-if="!detectedWalletOptions.length" class="tracked-wallet-unavailable">No wallet detected. Install or unlock Phantom, MetaMask, or another supported wallet, then refresh Cobra MemeScope.</p>
            <button v-if="trackedWalletAddress" class="tracked-wallet-cancel" type="button" @click="linkWalletMode = false">Cancel</button>
          </div>
          <small v-if="trackingWalletMessage" class="tracking-wallet-status" role="status">{{ trackingWalletMessage }}</small>
        </section>
        <div v-if="walletType === 'solana'" class="wallet-balance">
          <div><span>Solana balance</span><strong>{{ solBalance === null ? balanceMessage || 'Loading…' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(solBalance)} SOL` }}</strong></div>
          <button class="balance-refresh" type="button" :disabled="balanceLoading" aria-label="Refresh SOL balance" @click="refreshSolBalance()">↻</button>
        </div>
        <WalletHoldings v-if="walletType || (authType === 'email' && trackedWalletAddress)" :key="trackedWalletAddress || address" :token="sessionToken" />
        <div class="wallet-actions">
          <button v-if="walletType" class="secondary-action" type="button" @click="copyAddress">{{ copied ? 'Copied' : 'Copy address' }}</button>
          <button class="disconnect-action" type="button" @click="disconnectWallet">Sign out</button>
        </div>
        <p class="wallet-note">{{ walletType ? (profileStorageAvailable ? 'Your wallet signed a login message. No transaction was authorized.' : 'Wallet connected and signed in. Profile storage is unavailable until the database is configured; no transaction was authorized.') : `Signed in with ${walletName}.` }}</p>
      </template>

      <template v-else>
        <p class="dialog-description">{{ emailMode === 'signup' ? 'Create an account to start tracking markets.' : 'Sign in to continue to your account.' }}</p>
        <div class="auth-form-intro">
          <span class="auth-form-mark" aria-hidden="true">{{ emailMode === 'signup' ? '+' : '✓' }}</span>
          <div><strong>{{ emailMode === 'signup' ? 'Start with your email' : 'Secure &amp; protected' }}</strong><small>{{ emailMode === 'signup' ? 'Your account keeps your watchlist and profile in sync.' : 'Your account is protected by advanced security measures.' }}</small></div>
        </div>
        <form class="email-form" @submit.prevent="finishEmailAuth">
          <template v-if="emailMode === 'signup'">
            <label for="signup-username">USERNAME</label>
            <input id="signup-username" v-model="signupUsername" type="text" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="Choose a username" :aria-invalid="usernameAvailability === 'taken'" :aria-describedby="usernameAvailability === 'idle' ? 'signup-username-help' : 'signup-username-help signup-username-status'" required @input="resetUsernameAvailability" @blur="checkSignupUsername()" />
            <small id="signup-username-help" class="auth-field-help">3–24 letters, numbers, or underscores. Usernames are unique, including capitalization.</small>
            <small v-if="usernameAvailability !== 'idle'" id="signup-username-status" class="username-availability" :class="`is-${usernameAvailability}`" role="status">
              {{ usernameAvailability === 'checking' ? 'Checking username…' : usernameAvailability === 'available' ? 'Username is available.' : usernameAvailability === 'taken' ? 'That username is already taken.' : 'Could not check right now. We’ll confirm when you create your account.' }}
            </small>
          </template>
          <label for="email-address">EMAIL ADDRESS</label>
          <input id="email-address" v-model="emailAddress" type="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" required />
          <label for="email-password">PASSWORD</label>
          <input id="email-password" v-model="emailPassword" type="password" :autocomplete="emailMode === 'signup' ? 'new-password' : 'current-password'" minlength="10" maxlength="128" placeholder="At least 10 characters" required />
          <template v-if="emailMode === 'signup'">
            <label for="confirm-password">CONFIRM PASSWORD</label>
            <input id="confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="Enter your password again" required />
          </template>
          <button class="email-submit" type="submit" :disabled="emailBusy"><span>{{ emailBusy ? 'Please wait…' : emailMode === 'signup' ? 'Create account' : 'Sign in' }}</span><span aria-hidden="true">{{ emailBusy ? '◌' : '→' }}</span></button>
          <button class="email-mode" type="button" @click="toggleEmailMode">{{ emailMode === 'signin' ? 'New to Cobra MemeScope? Create an account' : 'Already have an account? Sign in' }}</button>
        </form>

        <p class="account-note">Your email account and a connected crypto wallet are separate sign-in methods.</p>
        <div class="wallet-divider"><span>OR CONNECT A WALLET</span></div>
        <p class="account-note">Choose Phantom, approve the connection, then approve the sign-in message in Phantom. Signing in does not send a transaction.</p>
        <div class="wallet-options">
          <div v-for="wallet in primaryWallets" :key="wallet.key" class="wallet-choice-wrap">
            <button class="wallet-choice" type="button" :disabled="connecting" @click="connectDetectedWallet(wallet)">
              <span class="wallet-choice-icon" :class="wallet.walletType === 'solana' ? 'sol-icon' : 'evm-icon'">{{ wallet.name.slice(0, 1) }}</span>
              <span>{{ connecting ? 'Check your wallet…' : wallet.label }}<small>{{ recentWalletKeys.includes(wallet.key) ? 'Recent' : wallet.network }}</small></span>
              <span v-if="recentWalletKeys.includes(wallet.key)" class="recent-tag">RECENT</span>
              <span v-else class="choice-arrow">›</span>
            </button>
            <a v-if="!wallet.provider" class="wallet-install-link" :href="wallet.downloadUrl" target="_blank" rel="noreferrer">Install {{ wallet.name }}</a>
          </div>
          <button v-if="additionalWallets.length" class="more-wallets" type="button" @click="moreWallets = !moreWallets">{{ moreWallets ? 'Show fewer wallets' : 'More wallets' }}<span>{{ moreWallets ? '−' : '+' }}</span></button>
          <template v-if="moreWallets">
            <div v-for="wallet in additionalWallets" :key="wallet.key" class="wallet-choice-wrap">
              <button class="wallet-choice" type="button" :disabled="connecting" @click="connectDetectedWallet(wallet)">
                <span class="wallet-choice-icon" :class="wallet.walletType === 'evm' ? 'evm-icon' : 'sol-icon'">{{ wallet.name.slice(0, 1) }}</span>
                <span>{{ wallet.label }}<small>{{ recentWalletKeys.includes(wallet.key) ? 'Recent' : wallet.network }}</small></span><span class="choice-arrow">›</span>
              </button>
              <a v-if="!wallet.provider" class="wallet-install-link" :href="wallet.downloadUrl" target="_blank" rel="noreferrer">Install {{ wallet.name }}</a>
            </div>
          </template>
        </div>
      </template>
      <p v-if="errorMessage" class="wallet-error" role="alert">{{ errorMessage }}</p>
    </section>
  </div>
  </Teleport>
</template>

<style scoped>
.wallet-controls { display: inline-flex; align-items: center; gap: 7px; }
.wallet-button { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border: 1px solid var(--line, #333); border-radius: 999px; background: var(--surface, #151515); color: var(--text, #f3f3f3); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.wallet-button img { width: 27px; height: 27px; border: 1px solid #8ca14d; border-radius: 50%; background: #171d18; object-fit: cover; }
.account-settings-button { display: grid; width: 40px; height: 40px; place-items: center; border: 1px solid var(--line, #333); border-radius: 50%; background: var(--surface, #151515); color: var(--text, #f3f3f3); cursor: pointer; }
.account-settings-button:hover,.account-settings-button:focus-visible { border-color: #a8cc58; color: #c7eb6c; }
.wallet-backdrop { position: fixed; z-index: 2147483647; inset: 0; display: grid; place-items: center; padding: 18px; background: rgb(0 0 0 / 68%); backdrop-filter: blur(7px); overscroll-behavior: contain; }
.wallet-dialog { width: min(100%, 440px); max-height: min(90dvh, 820px); overflow-y: auto; overscroll-behavior: contain; padding: 26px; border: 1px solid var(--line, #303030); border-radius: 20px; background: var(--surface, #111); color: var(--text, #f5f5f5); box-shadow: 0 24px 80px rgb(0 0 0 / 45%); }
.dialog-header { position: sticky; top: -26px; z-index: 3; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: -26px -26px 0; padding: 26px 26px 14px; border-bottom: 1px solid #303830; background: var(--surface, #111); }
.dialog-header-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
.settings-back-button { min-height: 34px; padding: 0 10px; border: 1px solid #383838; border-radius: 999px; background: #191919; color: #d5e9a5; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.dialog-eyebrow { color: #a3c94d; font-size: 10px; font-weight: 800; letter-spacing: .14em; }
.dialog-header h2 { margin: 5px 0 0; font-size: clamp(17px, 5vw, 27px); letter-spacing: -.04em; }
.dialog-header h2.connected-title { font-size: clamp(18px, 4vw, 22px); line-height: 1.2; letter-spacing: -.03em; }
.dialog-close { display: grid; width: 44px; height: 44px; flex: 0 0 44px; place-items: center; border: 1px solid var(--line, #333); border-radius: 50%; background: #202820; color: inherit; font-size: 25px; line-height: 1; cursor: pointer; touch-action: manipulation; }
.dialog-close:hover { border-color: #a8cc58; background: #293425; color: #c7eb6c; }
.settings-description { margin: 14px 0; color: #a5a5a5; font-size: 13px; line-height: 1.55; }
.settings-profile { display: flex; align-items: center; gap: 11px; padding: 13px 0 17px; border-bottom: 1px solid #303030; }
.settings-profile .connected-details { min-width: 0; }
.settings-profile .connected-details span { overflow-wrap: anywhere; }
.settings-profile .secondary-action { max-width: 112px; }
.invite-preference { display: grid; gap: 10px; margin-top: 15px; padding: 14px; border: 1px solid #46573d; border-radius: 12px; background: linear-gradient(125deg, #222e20, #171f19 72%); box-shadow: inset 3px 0 #a9cc5b; }
.invite-preference-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.invite-preference-heading > div { display: grid; gap: 4px; }
.invite-eyebrow { color: #a9cc5b; font-size: 8px; font-weight: 850; letter-spacing: .12em; }
.invite-preference-heading > div > strong { color: #edf4e5; font-size: 14px; }
.invite-preference-heading > div > small { color: #b0bba7; font-size: 10px; line-height: 1.5; }
.invite-count { display: grid; min-width: 55px; justify-items: center; gap: 2px; padding: 6px 9px; border: 1px solid #3b4736; border-radius: 9px; background: #202820; }
.invite-count strong { color: #c7eb6c; font-size: 17px; }
.invite-count small { color: #a8b399; font-size: 7px; font-weight: 800; letter-spacing: .08em; }
.invite-link-row { display: flex; min-width: 0; gap: 7px; }
.invite-link-row input { width: 100%; min-width: 0; height: 40px; padding: 0 10px; border: 1px solid #414c3c; border-radius: 8px; outline: 0; background: #141a16; color: #d7e4c8; font: 10px 'DM Sans', sans-serif; }
.invite-link-row button,.invite-retry { min-height: 40px; flex: 0 0 auto; padding: 0 11px; border: 1px solid #607844; border-radius: 8px; background: #35472b; color: #e5f2d1; font: inherit; font-size: 9px; font-weight: 850; cursor: pointer; transition: background .16s ease, border-color .16s ease; }
.invite-link-row button:hover:not(:disabled),.invite-retry:hover:not(:disabled) { border-color: #9cbe5b; background: #405533; }
.invite-link-row button:disabled,.invite-retry:disabled { cursor: wait; opacity: .6; }
.invite-retry { justify-self: start; min-height: 30px; }
.invite-message { margin: 0; font-size: 10px; line-height: 1.5; }
.invite-error { color: #f0b5a9; }
.invite-success { color: #b7d98f; }
.currency-preference { display: grid; gap: 10px; margin-top: 14px; padding: 13px; border: 1px solid #363e35; border-radius: 10px; background: #171d18; }
.currency-preference > div:first-child { display: grid; gap: 4px; }
.currency-preference > div:first-child strong { font-size: 12px; }
.currency-preference > div:first-child small,.currency-rate-footer > small { color: #9da598; font-size: 10px; line-height: 1.5; }
.currency-select { display: flex; min-height: 42px; align-items: center; gap: 9px; padding: 0 10px; border: 1px solid #3b4438; border-radius: 8px; background: #202820; font-size: 17px; }
.currency-select select { width: 100%; height: 40px; border: 0; outline: 0; background: transparent; color: #edf2e9; font: inherit; font-size: 12px; }
.currency-select option { background: #202820; color: #edf2e9; }
.currency-rate-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.currency-rate-footer button { min-height: 30px; padding: 0 9px; border: 1px solid #3b4438; border-radius: 7px; background: #202820; color: #d9e6c2; font: inherit; font-size: 10px; cursor: pointer; }
.currency-rate-footer button:disabled { opacity: .6; cursor: wait; }
.currency-rate-error { margin: 0; color: #f0b5a9; font-size: 10px; line-height: 1.5; }
.delete-account-panel { display: grid; gap: 8px; margin-top: 15px; padding: 14px; border: 1px solid #613b3b; border-radius: 11px; background: #211717; }
.delete-account-eyebrow { color: #ff9e9e; font-size: 9px; font-weight: 850; letter-spacing: .13em; }
.delete-account-panel > strong { color: #f4dddd; font-size: 13px; }
.delete-account-panel p { margin: 0; color: #c09f9f; font-size: 11px; line-height: 1.5; }
.delete-account-trigger { min-height: 38px; padding: 0 12px; border: 1px solid #8a4d4d; border-radius: 8px; background: #542a2a; color: #ffe0e0; font: inherit; font-size: 11px; font-weight: 750; cursor: pointer; }
.delete-account-trigger:hover:not(:disabled) { background: #6b3333; }
.delete-account-trigger:disabled,.delete-confirm-actions .secondary-action:disabled { opacity: .55; cursor: not-allowed; }
.delete-confirm-form { display: grid; gap: 8px; margin-top: 4px; }
.delete-confirm-form label { color: #d7baba; font-size: 11px; }
.delete-confirm-form input { min-height: 40px; padding: 0 11px; border: 1px solid #633838; border-radius: 8px; outline: none; background: #171313; color: #f5e6e6; font: inherit; }
.delete-confirm-form input:focus { border-color: #d67878; }
.delete-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
.delete-confirm-actions .secondary-action { flex: 0 1 100px; }
.dialog-description { margin: 8px 0 14px; color: #b0b8ae; font-size: 13px; line-height: 1.55; }
.email-submit,.profile-submit { width: 100%; min-height: 44px; border: 0; border-radius: 10px; font: inherit; font-weight: 750; cursor: pointer; }
.tracked-wallet-form { display: grid; gap: 9px; margin-top: 14px; padding: 13px; border: 1px solid #363e35; border-radius: 11px; background: #171d18; }
.tracked-wallet-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.tracked-wallet-heading > div { display: grid; gap: 5px; }
.tracked-wallet-form label { color: #b7d76c; font-size: 9px; font-weight: 850; letter-spacing: .12em; }
.tracked-wallet-form p { color: #a5ada1; font-size: 10px; line-height: 1.5; }
.linked-wallet-badge { padding: 4px 7px; border: 1px solid #485b35; border-radius: 999px; background: #273421; color: #c7eb6c; font-size: 8px; font-weight: 850; letter-spacing: .08em; }
.tracked-wallet-linked { display: flex; align-items: center; justify-content: space-between; gap: 9px; padding: 9px 10px; border: 1px solid #354333; border-radius: 8px; background: #202820; color: #e4edda; font-size: 11px; font-weight: 700; }
.tracked-wallet-linked button,.tracked-wallet-change,.tracked-wallet-cancel { padding: 5px 8px; border: 1px solid #45513f; border-radius: 7px; background: #202820; color: #b8c5ac; font: inherit; font-size: 9px; cursor: pointer; }
.tracked-wallet-linked button:disabled { opacity: .55; cursor: wait; }
.tracked-wallet-change { justify-self: start; color: #c7eb6c; }
.tracked-wallet-options { display: grid; gap: 7px; }
.wallet-signature-note { margin: 0 0 2px; color: #a5ada1; font-size: 9px; line-height: 1.5; }
.tracked-wallet-choice { display: flex; align-items: center; gap: 9px; min-height: 49px; padding: 7px 9px; border: 1px solid #303a30; border-radius: 9px; background: #202820; color: #edf2e8; font: inherit; text-align: left; cursor: pointer; }
.tracked-wallet-choice:hover:not(:disabled) { border-color: #8ba742; background: #252f23; }
.tracked-wallet-choice:disabled { opacity: .6; cursor: wait; }
.tracked-wallet-icon { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 8px; background: #37452c; color: #c7eb6c; font-size: 11px; font-weight: 850; }
.tracked-wallet-choice > span:nth-child(2) { display: grid; flex: 1; gap: 3px; font-size: 11px; font-weight: 750; }
.tracked-wallet-choice small { color: #a5ada1; font-size: 9px; font-weight: 500; }
.tracked-wallet-choice b { color: #a7c957; font-size: 14px; }
.tracked-wallet-unavailable { margin: 0; color: #dfc98f; font-size: 9px; line-height: 1.5; }
.tracked-wallet-cancel { justify-self: start; }
.tracking-wallet-status { color: #a9d77b; font-size: 10px; line-height: 1.4; }
.setup-note { margin: 5px 0; color: #9c9c9c; font-size: 12px; text-align: center; }
.auth-form-intro { display: flex; align-items: center; gap: 11px; padding: 12px; border: 1px solid #35443a; border-radius: 11px; background: linear-gradient(110deg, #1a2823, #17201c); }
.auth-form-mark { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border: 1px solid #455b40; border-radius: 10px; background: #263627; color: #c7eb6c; font-size: 19px; font-weight: 800; }
.auth-form-intro > div { display: grid; gap: 3px; }
.auth-form-intro strong { color: #e8eee4; font-size: 12px; }
.auth-form-intro small { color: #a4b0a3; font-size: 10px; line-height: 1.4; }
.email-form { display: grid; gap: 8px; margin-top: 14px; }
.email-form label,.profile-form label { margin-top: 5px; color: #b7c2b1; font-size: 9px; font-weight: 850; letter-spacing: .11em; }
.email-form input,.profile-form input { width: 100%; min-height: 47px; box-sizing: border-box; padding: 0 13px; border: 1px solid #354137; border-radius: 10px; outline: none; background: #141a16; color: #f1f5ee; font: inherit; font-size: 13px; transition: border-color .16s ease, box-shadow .16s ease, background .16s ease; }
.email-form input::placeholder,.profile-form input::placeholder { color: #778276; }
.email-form input:hover,.profile-form input:hover { border-color: #51614a; }
.email-form input:focus,.profile-form input:focus { border-color: #a8cb5c; background: #171f19; box-shadow: 0 0 0 3px rgb(168 203 92 / 14%); }
.email-form input[aria-invalid="true"] { border-color: #c76f66; }
.auth-field-help,.username-availability { margin-top: -3px; color: #a4b0a3; font-size: 10px; line-height: 1.45; }
.username-availability.is-checking { color: #b8c5ac; }
.username-availability.is-available { color: #b7d98f; }
.username-availability.is-taken { color: #f0a79d; }
.username-availability.is-unavailable { color: #dfc98f; }
.email-submit,.profile-submit { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; padding: 0 15px; background: linear-gradient(110deg, #c7eb6c, #b6dc65); color: #172012; box-shadow: 0 5px 16px rgb(162 198 82 / 12%); transition: transform .16s ease, filter .16s ease; }
.email-submit:hover:not(:disabled),.profile-submit:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
.email-submit > span:first-child { font-size: 13px; }
.email-submit > span:last-child { font-size: 18px; }
.email-submit:disabled,.profile-submit:disabled,.wallet-choice:disabled { opacity: .6; cursor: wait; }
.email-mode { min-height: 42px; padding: 0 10px; border: 1px solid #354137; border-radius: 9px; background: #19211b; color: #d2e5ad; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; transition: border-color .16s ease, background .16s ease; }
.email-mode:hover { border-color: #697f4b; background: #202b21; }
.account-note { margin: 13px 0 16px; color: #959595; font-size: 12px; line-height: 1.55; }
.wallet-divider { display: flex; align-items: center; gap: 10px; margin: 14px 0 11px; color: #8b8b8b; font-size: 9px; font-weight: 800; letter-spacing: .12em; }
.wallet-divider::before,.wallet-divider::after { height: 1px; flex: 1; background: #303030; content: ''; }
.wallet-options { display: grid; gap: 8px; }
.wallet-choice-wrap { display: grid; gap: 3px; }
.wallet-install-link { justify-self: end; padding: 0 9px 4px; color: #c7eb6c; font-size: 10px; text-decoration: none; }
.wallet-install-link:hover { text-decoration: underline; }
.wallet-choice { display: flex; align-items: center; gap: 11px; width: 100%; min-height: 58px; padding: 9px 11px; border: 1px solid #303a31; border-radius: 11px; background: #171e19; color: #f1f5ee; font: inherit; text-align: left; cursor: pointer; transition: border-color .16s ease, background .16s ease, transform .16s ease; }
.wallet-choice:hover:not(:disabled) { border-color: #8ba742; background: #1d2116; transform: translateY(-1px); }
.wallet-choice > span:nth-child(2) { display: grid; flex: 1; gap: 3px; font-size: 13px; font-weight: 700; }
.wallet-choice small { color: #999; font-size: 10px; font-weight: 500; }
.wallet-choice-icon { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border-radius: 10px; font-size: 15px; font-weight: 800; }
.sol-icon { background: #282047; color: #c8a9ff; }
.evm-icon { background: #263041; color: #a9ceff; }
.choice-arrow { color: #999; font-size: 22px; }
.recent-tag { color: #c7eb6c; font-size: 9px; font-weight: 800; letter-spacing: .08em; }
.more-wallets { display: flex; align-items: center; justify-content: space-between; min-height: 42px; padding: 0 5px; border: 0; background: transparent; color: #d2eb9a; font: inherit; font-size: 12px; font-weight: 750; cursor: pointer; }
.more-wallets span { font-size: 18px; }
.connected-wallet { display: flex; align-items: center; gap: 11px; margin-top: 22px; }
.connected-avatar,.profile-preview img { width: 50px; height: 50px; border: 2px solid #8ca14d; border-radius: 50%; background: #171d18; object-fit: cover; }
.connected-details { display: grid; flex: 1; gap: 4px; }
.connected-details strong { font-size: 14px; }
.connected-details span,.address-short { color: #999; font-size: 11px; }
.full-address { overflow-wrap: anywhere; margin-top: 15px; padding: 11px; border-radius: 8px; background: #1b1b1b; color: #999; font-size: 11px; }
.wallet-balance { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding: 12px; border: 1px solid #303030; border-radius: 10px; }
.wallet-balance div { display: grid; gap: 4px; }
.wallet-balance span { color: #999; font-size: 11px; }
.wallet-balance strong { font-size: 14px; }
.balance-refresh { border: 0; background: transparent; color: #c7eb6c; font-size: 20px; cursor: pointer; }
.wallet-actions { display: flex; gap: 9px; margin-top: 16px; }
.secondary-action,.disconnect-action { min-height: 40px; flex: 1; border: 1px solid #383838; border-radius: 9px; background: #191919; color: #eee; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.disconnect-action { border-color: #633838; color: #f2baba; }
.wallet-note { margin: 13px 0 0; color: #999; font-size: 11px; line-height: 1.5; }
.profile-preview { display: flex; align-items: center; gap: 12px; margin: 20px 0; }
.profile-preview span { display: grid; gap: 4px; }
.profile-preview small,.profile-form small { color: #999; font-size: 11px; }
.profile-form { display: grid; gap: 9px; }
.wallet-error { margin: 12px 0 0; padding: 10px 12px; border: 1px solid #633b36; border-radius: 9px; background: #281c1a; color: #ffb6a9; font-size: 12px; line-height: 1.5; }
.wallet-dialog button:focus-visible,.wallet-dialog input:focus-visible,.wallet-dialog select:focus-visible { outline: 2px solid #a8cb5c; outline-offset: 2px; }
.auth-dialog { width: min(100%, 470px); padding: 26px 28px 30px; border-color: #273044; border-radius: 18px; background: #07101f; background-image: radial-gradient(circle at 95% 0%, rgb(32 132 86 / 13%), transparent 30%), linear-gradient(145deg, #080f1d, #09101e 70%, #0a1422); }
.auth-dialog .dialog-header { top: -26px; margin: -26px -28px 0; padding: 22px 28px 13px; border-bottom: 1px solid #1a2334; background: #090f1c; }
.auth-dialog .dialog-title-block { display: grid; }
.auth-dialog .dialog-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.auth-dialog .dialog-brand img { width: 44px; height: 44px; object-fit: contain; }
.auth-dialog .dialog-brand span { display: grid; line-height: 1; }
.auth-dialog .dialog-brand strong { color: #f4f7fb; font: 800 18px/1 Manrope, sans-serif; letter-spacing: -.02em; }
.auth-dialog .dialog-brand small { margin-top: 3px; color: #b9e83d; font-size: 9px; font-weight: 850; letter-spacing: .06em; }
.auth-dialog .dialog-eyebrow { display: none; }
.auth-dialog .dialog-header h2 { margin-top: 4px; color: #f3f6fb; font-size: 31px; font-weight: 800; line-height: 1.08; }
.auth-dialog .dialog-close { border-color: #263149; background: #101827; color: #edf3ff; }
.auth-dialog .dialog-description { margin: 13px 0 16px; color: #b6bfd0; font-size: 13px; line-height: 1.5; }
.auth-dialog .auth-form-intro { min-height: 64px; box-sizing: border-box; border-color: #3d4b1d; border-radius: 12px; background: linear-gradient(100deg, rgb(43 62 31 / 78%), rgb(18 36 37 / 68%)); box-shadow: inset 0 0 0 1px rgb(180 213 75 / 4%); }
.auth-dialog .auth-form-mark { border-color: #7aa338; border-radius: 50%; background: #2a551d; color: #baf06b; }
.auth-dialog .auth-form-intro strong { color: #f4f7fb; font-size: 13px; }
.auth-dialog .auth-form-intro small { color: #aeb8c4; }
.auth-dialog .email-form { gap: 8px; margin-top: 13px; }
.auth-dialog .email-form label { margin-top: 7px; color: #e5e9f2; font-size: 11px; font-weight: 700; letter-spacing: 0; }
.auth-dialog .email-form input { min-height: 52px; border-color: #273044; border-radius: 11px; background: #111827; color: #f7f9fd; }
.auth-dialog .email-form input::placeholder { color: #718095; }
.auth-dialog .email-form input:focus { border-color: #a4c948; background: #121b2a; box-shadow: 0 0 0 3px rgb(164 201 72 / 12%); }
.auth-dialog .auth-field-help { color: #8f9aab; }
.auth-dialog .email-submit { min-height: 58px; margin-top: 12px; border-radius: 12px; font-weight: 850; }
.auth-dialog .email-submit > span:first-child { margin-left: 1px; color: #102018; font-size: 14px; }
.auth-dialog .email-mode { min-height: 44px; border-color: transparent; background: transparent; color: #d1e67f; }
.auth-dialog .account-note { margin: 10px 0 8px; color: #8995a7; font-size: 11px; text-align: center; }
.auth-dialog .wallet-divider { margin: 12px 0 7px; color: #8794a7; }
.auth-dialog .wallet-divider::before,.auth-dialog .wallet-divider::after { background: #263044; }
.auth-dialog .wallet-options { gap: 7px; }
.auth-dialog .wallet-choice { min-height: 64px; border-color: #263044; border-radius: 12px; background: #111827; }
.auth-dialog .wallet-choice:hover:not(:disabled) { border-color: #8dac40; background: #172033; }
.auth-dialog .wallet-choice-icon { width: 42px; height: 42px; flex-basis: 42px; border-radius: 50%; }
.auth-dialog .sol-icon { background: #6337c8; color: #fff; }
.auth-dialog .evm-icon { background: #1766b3; color: #fff; }
.auth-dialog .wallet-choice small { color: #929db0; }
.auth-dialog .choice-arrow { color: #b7ea4b; }
@media (max-width: 480px) {
  .wallet-backdrop { align-items: end; padding: max(0px, env(safe-area-inset-top)) 0 0; }
  .wallet-dialog { width: 100%; max-height: calc(100dvh - env(safe-area-inset-top)); padding: 22px 18px max(22px, env(safe-area-inset-bottom)); border-radius: 20px 20px 0 0; }
  .dialog-header { top: 0; margin: -22px -18px 0; padding: max(14px, env(safe-area-inset-top)) 18px 12px; }
  .dialog-close { width: 48px; height: 48px; flex-basis: 48px; border-color: #66784c; background: #273322; color: #d7edaa; font-size: 30px; box-shadow: 0 3px 12px rgb(0 0 0 / 25%); }
  .dialog-header h2 { font-size: 24px; }
  .invite-preference { padding: 12px; }
  .invite-link-row { align-items: stretch; }
  .invite-link-row input { font-size: 9px; }
  .invite-link-row button { padding: 0 9px; font-size: 8px; }
  .auth-form-intro { padding: 11px; }
  .account-note { font-size: 11px; }
  .wallet-divider { margin: 12px 0 10px; }
}
</style>
