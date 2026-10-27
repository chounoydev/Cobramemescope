<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import TokenLogo from './TokenLogo.vue'
import type { MarketChartInterval, TrendingMemecoin, TrendingMemecoinDetails } from '../lib/api'
import { fetchTrendingMemecoinDetails } from '../lib/api'
import { formatCurrency, selectedCurrency } from '../lib/currency'

const props = defineProps<{ coin: TrendingMemecoin | null }>()
const emit = defineEmits<{
  close: []
  scan: [address: string]
}>()

const details = ref<TrendingMemecoinDetails | null>(null)
const loading = ref(false)
const error = ref('')
const priceUpdateError = ref('')
const pricePulse = ref('')
const copied = ref(false)
const selectedInterval = ref<MarketChartInterval>('1h')
const chartStyle = ref<'candles' | 'line'>('candles')
const visibleCandleCount = ref(24)
const panOffset = ref(0)
const cachedHolderCount = ref<number | null>(null)
const cachedHolderCountSource = ref<string | null>(null)
let panStartX: number | null = null
let panStartOffset = 0
let holderCountCacheKey: string | null = null
const chartIntervals: { value: MarketChartInterval; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '5m', label: '5M' },
  { value: '1h', label: '1H' },
  { value: '2h', label: '2H' },
  { value: '3h', label: '3H' },
  { value: '5h', label: '5H' },
  { value: '8h', label: '8H' },
  { value: '1d', label: '1D' },
  { value: '1mo', label: '1MO' },
]
let activeRequest: AbortController | null = null
let pricePulseTimer: number | undefined

watch(() => [props.coin && `${props.coin.chainId}:${props.coin.address}`, selectedInterval.value] as const, async ([key, interval], _previous, onCleanup) => {
  activeRequest?.abort()
  if (key !== holderCountCacheKey) {
    holderCountCacheKey = key
    cachedHolderCount.value = null
    cachedHolderCountSource.value = null
  }
  details.value = null
  error.value = ''
  priceUpdateError.value = ''
  pricePulse.value = ''
  copied.value = false
  if (!key || !props.coin) {
    loading.value = false
    return
  }

  const controller = new AbortController()
  activeRequest = controller
  let refreshTimer: number | undefined
  let refreshInFlight = false
  onCleanup(() => {
    controller.abort()
    if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
  })

  const refreshDetails = async (initial: boolean) => {
    if (refreshInFlight || controller.signal.aborted || !props.coin) return
    refreshInFlight = true
    if (initial) loading.value = true
    try {
      const latest = await fetchTrendingMemecoinDetails(props.coin.chainId, props.coin.address, interval, controller.signal)
      if (controller.signal.aborted) return
      const previousPrice = details.value?.market.priceUsd
      const latestPrice = latest.market.priceUsd
      const latestDetails = !initial && !latest.chart.points.length && details.value?.chart.points.length
        ? { ...latest, chart: details.value.chart }
        : latest
      details.value = latestDetails
      priceUpdateError.value = ''
      if (initial) {
        visibleCandleCount.value = Math.min(24, latestDetails.chart.points.length)
        panOffset.value = 0
      }
      if (latest.market.holderCount !== null) {
        cachedHolderCount.value = latest.market.holderCount
        cachedHolderCountSource.value = latest.market.holderCountSource
      }
      if (!initial && previousPrice !== null && previousPrice !== undefined && latestPrice !== null
        && latestPrice !== previousPrice) {
        pricePulse.value = latestPrice > previousPrice ? 'price-up' : 'price-down'
        if (pricePulseTimer !== undefined) window.clearTimeout(pricePulseTimer)
        pricePulseTimer = window.setTimeout(() => { pricePulse.value = '' }, 1200)
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        const message = requestError instanceof Error ? requestError.message : 'Live price update failed.'
        if (initial) error.value = message
        else priceUpdateError.value = message
      }
    } finally {
      refreshInFlight = false
      if (initial && !controller.signal.aborted) loading.value = false
    }
  }

  await refreshDetails(true)
  if (!controller.signal.aborted) {
    refreshTimer = window.setInterval(() => { void refreshDetails(false) }, 15_000)
  }
}, { immediate: true })

onUnmounted(() => {
  activeRequest?.abort()
  if (pricePulseTimer !== undefined) window.clearTimeout(pricePulseTimer)
})

const points = computed(() => details.value?.chart.points || [])
const listings = computed(() => details.value?.listings || [])
const selectedIntervalLabel = computed(() => chartIntervals.find((item) => item.value === selectedInterval.value)?.label || selectedInterval.value.toUpperCase())
const visiblePoints = computed(() => {
  const end = Math.max(0, points.value.length - panOffset.value)
  return points.value.slice(Math.max(0, end - visibleCandleCount.value), end)
})
const maximumPanOffset = computed(() => Math.max(0, points.value.length - visibleCandleCount.value))
const canZoomIn = computed(() => visibleCandleCount.value > Math.min(6, points.value.length))
const canZoomOut = computed(() => visibleCandleCount.value < points.value.length)
const isDefaultView = computed(() => panOffset.value === 0 && visibleCandleCount.value === Math.min(24, points.value.length))
const chartCoordinates = computed(() => {
  if (!visiblePoints.value.length) return []
  const min = Math.min(...visiblePoints.value.map((point) => point.low))
  const max = Math.max(...visiblePoints.value.map((point) => point.high))
  const spread = max - min || Math.max(max * 0.01, Number.EPSILON)
  const maxVolume = Math.max(...visiblePoints.value.map((point) => point.volumeUsd), 0)
  return visiblePoints.value.map((point, index) => ({
    ...point,
    x: 36 + (index / Math.max(visiblePoints.value.length - 1, 1)) * 594,
    openY: 18 + ((max - point.open) / spread) * 128,
    highY: 18 + ((max - point.high) / spread) * 128,
    lowY: 18 + ((max - point.low) / spread) * 128,
    closeY: 18 + ((max - point.close) / spread) * 128,
    bodyY: 18 + ((max - Math.max(point.open, point.close)) / spread) * 128,
    bodyHeight: Math.max(1, (Math.abs(point.open - point.close) / spread) * 128),
    volumeY: 207 - (maxVolume > 0 ? (point.volumeUsd / maxVolume) * 44 : 0),
    volumeHeight: maxVolume > 0 ? Math.max(1, (point.volumeUsd / maxVolume) * 44) : 0,
    isBullish: point.close >= point.open,
  }))
})
const candleWidth = computed(() => Math.min(18, Math.max(4, (594 / Math.max(chartCoordinates.value.length, 1)) * 0.62)))
const priceGridLabels = computed(() => {
  if (!visiblePoints.value.length) return []
  const min = Math.min(...visiblePoints.value.map((point) => point.low))
  const max = Math.max(...visiblePoints.value.map((point) => point.high))
  return [0, 1, 2, 3, 4].map((index) => ({
    y: 18 + index * 32,
    price: max - ((max - min) * index) / 4,
  }))
})
const currentPriceCoordinate = computed(() => chartCoordinates.value.at(-1))
const firstVisiblePoint = computed(() => visiblePoints.value[0])
const middleVisiblePoint = computed(() => visiblePoints.value[Math.floor(visiblePoints.value.length / 2)])
const lastVisiblePoint = computed(() => visiblePoints.value[visiblePoints.value.length - 1])
const lineIsUp = computed(() => (visiblePoints.value.at(-1)?.close ?? 0) >= (visiblePoints.value[0]?.close ?? 0))
const linePath = computed(() => chartCoordinates.value.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.closeY}`).join(' '))
const lineAreaPath = computed(() => {
  if (chartCoordinates.value.length === 0) return ''
  const first = chartCoordinates.value[0]!
  const last = chartCoordinates.value[chartCoordinates.value.length - 1]!
  return `${linePath.value} L ${last.x} 146 L ${first.x} 146 Z`
})
const change24h = computed(() => details.value?.market.change24h ?? props.coin?.change24h ?? null)
const isPositive = computed(() => (change24h.value ?? 0) >= 0)

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return formatCurrency(value)
}

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (value > 0 && value < 0.01) return formatPrice(value)
  return formatCurrency(value, true)
}

function formatDexName(dex: string) {
  const knownNames: Record<string, string> = {
    aerodrome: 'Aerodrome',
    baseswap: 'BaseSwap',
    pancakeswap: 'PancakeSwap',
    'pump.fun': 'Pump.fun',
    pumpfun: 'Pump.fun',
    pumpswap: 'PumpSwap',
    raydium: 'Raydium',
    sushiswap: 'SushiSwap',
    uniswap: 'Uniswap',
  }
  return knownNames[dex.toLowerCase()] || dex.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function venueInitials(dex: string) {
  const words = dex.replace(/[^a-z0-9]+/gi, ' ').trim().split(/\s+/).filter(Boolean)
  return words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() : (words[0] || 'DX').slice(0, 2).toUpperCase()
}

function venueLogoClass(dex: string) {
  const colorIndex = [...dex.toLowerCase()].reduce((total, letter) => total + letter.charCodeAt(0), 0) % 6
  return `venue-logo-theme-${colorIndex}`
}

function formatTime(value: number) {
  const date = new Date(value)
  if (selectedInterval.value === '1d' || selectedInterval.value === '1mo') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(selectedInterval.value === '1mo' ? { year: '2-digit' } : {}) })
  }
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function zoomIn() {
  const nextCount = Math.max(Math.min(6, points.value.length), Math.floor(visibleCandleCount.value * 0.75))
  visibleCandleCount.value = Math.min(visibleCandleCount.value - 1, nextCount)
  panOffset.value = Math.min(panOffset.value, maximumPanOffset.value)
}

function zoomOut() {
  const nextCount = Math.min(points.value.length, Math.max(visibleCandleCount.value + 1, Math.ceil(visibleCandleCount.value / 0.75)))
  visibleCandleCount.value = nextCount
  panOffset.value = Math.min(panOffset.value, maximumPanOffset.value)
}

function resetChartView() {
  visibleCandleCount.value = Math.min(24, points.value.length)
  panOffset.value = 0
}

function handleChartWheel(event: WheelEvent) {
  if (event.deltaY < 0) zoomIn()
  else if (event.deltaY > 0) zoomOut()
}

function startChartPan(event: PointerEvent) {
  if (event.button !== 0) return
  panStartX = event.clientX
  panStartOffset = panOffset.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function moveChartPan(event: PointerEvent) {
  if (panStartX === null) return
  const chartWidth = (event.currentTarget as HTMLElement).clientWidth
  if (!chartWidth) return
  const offsetChange = Math.round(((event.clientX - panStartX) / chartWidth) * visibleCandleCount.value)
  panOffset.value = Math.min(maximumPanOffset.value, Math.max(0, panStartOffset + offsetChange))
}

function stopChartPan() {
  panStartX = null
}

function formatHolderCount(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Not reported'
  return new Intl.NumberFormat('en-US').format(value)
}

function formatAge(createdAt: number | null | undefined) {
  if (!createdAt) return 'Not available'
  const hours = Math.max(0, Math.floor((Date.now() - createdAt) / 3_600_000))
  if (hours < 24) return `${Math.max(1, hours)}h`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

async function copyAddress() {
  if (!props.coin) return
  try {
    await navigator.clipboard.writeText(props.coin.address)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1400)
  } catch {
    copied.value = false
  }
}

function reviewContract() {
  if (!props.coin) return
  const address = props.coin.address
  emit('close')
  emit('scan', address)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="coin" class="market-detail-overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
      <section class="market-detail-dialog" role="dialog" aria-modal="true" :aria-label="`${coin.name} market details`">
        <header class="detail-header">
          <div class="detail-identity">
            <TokenLogo :src="coin.image" :symbol="coin.symbol" :address="coin.address" :size="44" />
            <div><div class="detail-overline">MARKET TAPE <span>{{ coin.chain }}</span></div><h2>{{ details?.token.name || coin.name }} <small>{{ details?.token.symbol || coin.symbol }}</small></h2><code>{{ coin.address }}</code></div>
          </div>
          <button class="detail-close" type="button" aria-label="Close market details" @click="emit('close')">×</button>
        </header>

        <div class="detail-body">
          <div v-if="loading" class="detail-loading" role="status"><span class="detail-spinner"></span><span>Loading live market data</span></div>
          <p v-else-if="error" class="detail-error" role="alert">{{ error }}</p>
          <template v-else>
            <div class="detail-dashboard">
              <div class="detail-primary">
                <section class="price-chart-section" aria-label="Live price chart">
                  <div class="chart-heading"><div><span>{{ selectedCurrency }} PRICE · {{ selectedIntervalLabel }}</span><small class="price-live-status" :class="{ delayed: priceUpdateError }" role="status">{{ priceUpdateError ? 'LIVE UPDATE DELAYED' : `LIVE · ${selectedIntervalLabel} ${chartStyle === 'candles' ? 'CANDLES' : 'LINE'}` }}</small><strong class="chart-price" :class="pricePulse" aria-live="polite">{{ formatPrice(details?.market.priceUsd ?? coin.priceUsd) }}</strong></div><span v-if="change24h !== null" class="chart-change" :class="isPositive ? 'change-positive' : 'change-negative'">{{ isPositive ? '+' : '' }}{{ change24h.toFixed(2) }}%</span></div>
                  <div class="chart-intervals" role="group" aria-label="Chart interval">
                    <button v-for="interval in chartIntervals" :key="interval.value" type="button" :class="{ active: selectedInterval === interval.value }" :aria-pressed="selectedInterval === interval.value" @click="selectedInterval = interval.value">{{ interval.label }}</button>
                  </div>
                  <div class="chart-controls" role="group" aria-label="Chart controls">
                    <span>{{ visiblePoints.length }} candles</span>
                    <div class="chart-type-toggle" role="group" aria-label="Chart style">
                      <button type="button" :class="{ active: chartStyle === 'candles' }" :aria-pressed="chartStyle === 'candles'" @click="chartStyle = 'candles'">CANDLES</button>
                      <button type="button" :class="{ active: chartStyle === 'line' }" :aria-pressed="chartStyle === 'line'" @click="chartStyle = 'line'">LINE</button>
                    </div>
                    <button type="button" aria-label="Zoom out" :disabled="!canZoomOut" @click="zoomOut">−</button>
                    <button type="button" aria-label="Zoom in" :disabled="!canZoomIn" @click="zoomIn">+</button>
                    <button type="button" :disabled="isDefaultView" @click="resetChartView">RESET</button>
                  </div>
                  <div v-if="visiblePoints.length" class="price-chart" @wheel.prevent="handleChartWheel" @pointerdown="startChartPan" @pointermove="moveChartPan" @pointerup="stopChartPan" @pointercancel="stopChartPan">
                    <svg viewBox="0 0 720 230" role="img" :aria-label="`${selectedIntervalLabel} ${chartStyle} price and volume chart for ${coin.name}. Use the mouse wheel to zoom and drag to pan.`" preserveAspectRatio="none">
                      <rect x="0" y="0" width="720" height="230" class="chart-background" />
                      <line v-for="line in priceGridLabels" :key="line.y" x1="8" :y1="line.y" x2="630" :y2="line.y" class="chart-gridline" />
                      <line x1="8" y1="158" x2="630" y2="158" class="chart-volume-divider" />
                      <text v-for="line in priceGridLabels" :key="`price-${line.y}`" x="640" :y="line.y + 3" class="chart-price-axis">{{ formatUsd(line.price) }}</text>
                      <text x="8" y="224" class="chart-volume-label">VOLUME</text>
                      <g class="chart-volume-bars">
                        <rect v-for="point in chartCoordinates" :key="`volume-${point.timestamp}`" :x="point.x - candleWidth / 2" :y="point.volumeY" :width="candleWidth" :height="point.volumeHeight" :class="point.isBullish ? 'volume-bullish' : 'volume-bearish'">
                          <title>{{ formatTime(point.timestamp) }} · Volume {{ formatUsd(point.volumeUsd) }}</title>
                        </rect>
                      </g>
                      <line v-if="currentPriceCoordinate" x1="8" :y1="currentPriceCoordinate.closeY" x2="630" :y2="currentPriceCoordinate.closeY" class="chart-current-price-line" />
                      <g v-if="chartStyle === 'candles'">
                        <g v-for="point in chartCoordinates" :key="point.timestamp" :class="point.isBullish ? 'candle-bullish' : 'candle-bearish'">
                          <line :x1="point.x" :y1="point.highY" :x2="point.x" :y2="point.lowY" class="candle-wick" />
                          <rect :x="point.x - candleWidth / 2" :y="point.bodyY" :width="candleWidth" :height="point.bodyHeight" rx="1" class="candle-body">
                            <title>{{ new Date(point.timestamp).toLocaleString() }} · O {{ formatPrice(point.open) }} · H {{ formatPrice(point.high) }} · L {{ formatPrice(point.low) }} · C {{ formatPrice(point.close) }}</title>
                          </rect>
                        </g>
                      </g>
                      <g v-else :class="lineIsUp ? 'price-line-up' : 'price-line-down'">
                        <path :d="lineAreaPath" class="price-line-area" />
                        <path :d="linePath" class="price-line-path" />
                      </g>
                      <rect v-if="currentPriceCoordinate" x="636" :y="currentPriceCoordinate.closeY - 9" width="82" height="18" rx="2" class="chart-current-price-tag" :class="currentPriceCoordinate.isBullish ? 'price-tag-up' : 'price-tag-down'" />
                      <text v-if="currentPriceCoordinate" x="642" :y="currentPriceCoordinate.closeY + 3" class="chart-current-price-text">{{ formatPrice(currentPriceCoordinate.close) }}</text>
                    </svg>
                    <div class="chart-axis"><span>{{ formatTime(firstVisiblePoint!.timestamp) }}</span><span>{{ formatTime(middleVisiblePoint!.timestamp) }}</span><span>{{ formatTime(lastVisiblePoint!.timestamp) }}</span></div>
                  </div>
                  <div v-else class="chart-empty">{{ loading ? 'Loading price history…' : 'Price history is unavailable for this pool.' }}</div>
                  <small class="chart-source">{{ chartStyle === 'candles' ? 'OHLC candles' : 'Closing price' }} + volume · green up · red down · {{ details?.market.dex || coin.dex }} pool · GeckoTerminal</small>
                </section>

                <div class="metrics-market-layout">
                  <section class="detail-metrics" aria-label="Market metrics">
                    <article><span>HOLDER COUNT</span><strong>{{ formatHolderCount(details?.market.holderCount ?? cachedHolderCount) }}</strong><small>{{ details?.market.holderCountSource || cachedHolderCountSource || 'Not provided by the chain data source' }}</small></article>
                    <article><span>MARKET CAP</span><strong>{{ formatUsd(details?.market.marketCapUsd) }}</strong></article>
                    <article><span>FULLY DILUTED VALUE</span><strong>{{ formatUsd(details?.market.fdvUsd) }}</strong></article>
                    <article><span>POOL LIQUIDITY</span><strong>{{ formatUsd(details?.market.liquidityUsd ?? coin.liquidityUsd) }}</strong></article>
                    <article><span>24H VOLUME</span><strong>{{ formatUsd(details?.market.volume24hUsd ?? coin.volume24h) }}</strong></article>
                    <article><span>BUYS / SELLS</span><strong>{{ details?.market.buys24h ?? coin.buys24h }} / {{ details?.market.sells24h ?? coin.sells24h }}</strong></article>
                    <article><span>POOL AGE</span><strong>{{ formatAge(details?.market.pairCreatedAt) }}</strong></article>
                  </section>

                  <aside class="listing-panel" aria-label="Listing venues and launch pools">
                    <header class="listing-panel-header"><div><span>MARKET VENUES</span><h3>Listed on</h3></div><span class="listing-count">{{ listings.length }} {{ listings.length === 1 ? 'POOL' : 'POOLS' }}</span></header>
                    <div v-if="listings.length" class="venue-list">
                      <article v-for="listing in listings" :key="listing.pairAddress || `${listing.dex}:${listing.pairUrl}`" class="venue-item">
                        <span class="venue-logo" :class="venueLogoClass(listing.dex)" :aria-label="`${formatDexName(listing.dex)} logo`">{{ venueInitials(listing.dex) }}</span>
                        <div class="venue-details"><strong>{{ formatDexName(listing.dex) }}</strong><span>Pool · {{ formatAge(listing.pairCreatedAt) }}</span><a v-if="listing.pairUrl" :href="listing.pairUrl" target="_blank" rel="noreferrer">OPEN MARKET ↗</a></div>
                        <span class="venue-liquidity">{{ formatUsd(listing.liquidityUsd) }}<small>LIQUIDITY</small></span>
                      </article>
                    </div>
                    <p v-else class="listing-empty">No listing pools were reported.</p>
                    <small class="listing-source">Pools discovered from DexScreener · up to 8 venues</small>
                  </aside>
                </div>

                <div class="detail-risk" :class="`risk-${coin.risk.level}`"><span>{{ coin.risk.level === 'danger' ? '×' : coin.risk.level === 'caution' ? '△' : coin.risk.level === 'clear' ? '✓' : '?' }}</span><div><strong>{{ coin.risk.label }}</strong><small>{{ coin.risk.reasons.join(' · ') || `${coin.risk.unknownCount} unknown checks` }}</small></div><button type="button" :disabled="coin.chainId === 'sui'" :title="coin.chainId === 'sui' ? 'Sui contract risk scanning is not available yet.' : 'Open full contract risk scan'" @click="reviewContract">{{ coin.chainId === 'sui' ? 'SUI CHECKS UNAVAILABLE' : 'OPEN FULL RISK SCAN ↗' }}</button></div>
              </div>

            </div>
          </template>
        </div>

        <footer class="detail-footer">
          <span>Market data is a snapshot, not an execution quote.</span>
          <div><button type="button" class="detail-copy" @click="copyAddress">{{ copied ? 'COPIED' : 'COPY ADDRESS' }}</button><a v-if="details?.market.pairUrl || coin.pairUrl" :href="details?.market.pairUrl || coin.pairUrl" target="_blank" rel="noreferrer">OPEN DEX PAIR ↗</a></div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.market-detail-overlay { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; overflow-y: auto; padding: 24px; background: rgb(18 25 19 / 66%); backdrop-filter: blur(4px); }
.market-detail-dialog { width: min(100%, 1180px); max-height: min(90vh, 920px); overflow-y: auto; border: 1px solid #d7ded0; background: #fff; box-shadow: 0 24px 80px rgb(0 0 0 / 28%); }
.detail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 20px 23px; border-bottom: 1px solid #e5e9e1; }.detail-identity { display: flex; min-width: 0; align-items: center; gap: 13px; }.detail-identity img,.detail-monogram { display: grid; width: 44px; height: 44px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: #e4edbf; color: #526638; object-fit: cover; font-weight: 800; }.detail-identity > div { min-width: 0; }.detail-overline { color: #858d80; font: 8px 'DM Mono', monospace; letter-spacing: .7px; }.detail-overline span { margin-left: 9px; color: #60764a; }.detail-identity h2 { overflow: hidden; margin-top: 4px; color: #242b22; font: 700 19px Manrope, sans-serif; text-overflow: ellipsis; white-space: nowrap; }.detail-identity h2 small { color: #879080; font: 10px 'DM Mono', monospace; }.detail-identity code { display: block; max-width: min(68vw, 580px); overflow: hidden; margin-top: 5px; color: #8a9186; font: 9px 'DM Mono', monospace; text-overflow: ellipsis; }.detail-close { width: 31px; height: 31px; flex: 0 0 auto; border: 1px solid #e1e6dc; background: #f7f8f4; color: #586252; font-size: 20px; }
.detail-body { padding: 19px 23px 20px; }.detail-dashboard { display: block; }.detail-primary { min-width: 0; }.metrics-market-layout { display: grid; grid-template-columns: minmax(0, 1fr) 275px; align-items: start; gap: 14px; margin-top: 14px; }.detail-loading { display: flex; min-height: 245px; align-items: center; justify-content: center; gap: 10px; color: #747d70; font-size: 12px; }.detail-spinner { width: 17px; height: 17px; border: 2px solid #dce4d3; border-top-color: #71864f; border-radius: 50%; animation: detail-spin .8s linear infinite; }.detail-error { padding: 35px 12px; color: #a64238; font-size: 12px; text-align: center; }
.price-chart-section { padding: 16px 17px 12px; border: 1px solid #e2e7dd; background: #fafbf8; }.chart-heading { display: flex; align-items: flex-end; justify-content: space-between; }.chart-heading > div { display: grid; gap: 6px; }.chart-heading > div > span { color: #869080; font: 8px 'DM Mono', monospace; letter-spacing: .6px; }.chart-heading strong { color: #20271e; font: 700 24px Manrope, sans-serif; }.chart-price.price-up { animation: market-price-up 1.2s ease-in-out; }.chart-price.price-down { animation: market-price-down 1.2s ease-in-out; }.price-live-status { color: #467d49; font: 8px 'DM Mono', monospace; letter-spacing: .3px; }.price-live-status.delayed { color: #a3483f; }.chart-change { padding: 5px 8px; font: 10px 'DM Mono', monospace; }.change-positive { background: #edf4e6; color: #50763b; }.change-negative { background: #faece9; color: #a3483f; }.chart-intervals { display: flex; gap: 4px; overflow-x: auto; margin-top: 13px; padding-bottom: 3px; }.chart-intervals button { min-width: 38px; min-height: 27px; padding: 0 7px; border: 1px solid #e1e6dc; background: #fff; color: #7b8475; font: 8px 'DM Mono', monospace; }.chart-intervals button.active { border-color: #71864f; background: #edf4e6; color: #486a35; }.chart-controls { display: flex; align-items: center; justify-content: flex-end; gap: 5px; margin-top: 8px; color: #858d80; font: 8px 'DM Mono', monospace; }.chart-controls span { margin-right: auto; }.chart-controls button { min-width: 28px; height: 25px; padding: 0 7px; border: 1px solid #e1e6dc; background: #fff; color: #586252; font: 10px 'DM Mono', monospace; }.chart-controls button:last-child { font-size: 8px; }.chart-controls button:disabled { cursor: default; opacity: .45; }
.price-chart { margin-top: 4px; overflow: hidden; border: 1px solid #272b30; background: #0d0f12; cursor: grab; touch-action: none; user-select: none; }.price-chart:active { cursor: grabbing; }.price-chart svg { display: block; width: 100%; height: 230px; }.chart-background { fill: #0d0f12; }.chart-gridline { stroke: #292d33; stroke-width: 1; }.chart-volume-divider { stroke: #30343a; stroke-width: 1; }.chart-price-axis,.chart-volume-label { fill: #969ba3; font: 10px 'DM Mono', monospace; }.chart-price-axis { text-anchor: start; }.chart-volume-label { font-size: 8px; letter-spacing: .5px; }.chart-current-price-line { stroke: #43cf82; stroke-dasharray: 4 4; stroke-width: 1; }.chart-current-price-tag.price-tag-up { fill: #27ae60; }.chart-current-price-tag.price-tag-down { fill: #d95157; }.chart-current-price-text { fill: #fff; font: 9px 'DM Mono', monospace; }.chart-volume-bars { opacity: .62; }.volume-bullish { fill: #23a765; }.volume-bearish { fill: #cf5559; }.candle-wick { stroke-width: 1.2; }.candle-body { stroke-width: .5; }.candle-bullish .candle-wick,.candle-bullish .candle-body { stroke: #218653; }.candle-bullish .candle-body { fill: #35b875; }.candle-bearish .candle-wick,.candle-bearish .candle-body { stroke: #c74343; }.candle-bearish .candle-body { fill: #e35d5d; }.chart-axis { display: flex; justify-content: space-between; gap: 5px; padding: 0 3% 0 5%; color: #92998d; font: 8px 'DM Mono', monospace; }.chart-axis span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.chart-axis span:last-child { text-align: right; }.chart-empty { display: grid; min-height: 145px; place-items: center; color: #8a9186; font-size: 11px; }.chart-source { display: block; margin-top: 10px; color: #92998d; font: 8px 'DM Mono', monospace; }
.chart-type-toggle { display: inline-flex; gap: 2px; margin-right: auto; padding: 2px; border: 1px solid #e1e6dc; background: #f1f3ed; }.chart-controls .chart-type-toggle button { min-width: 0; height: 22px; border-color: transparent; background: transparent; color: #77816f; font-size: 7px; }.chart-controls .chart-type-toggle button.active { border-color: #d9e2cf; background: #fff; color: #425735; }.price-line-area { stroke: none; }.price-line-up .price-line-area { fill: rgb(35 154 95 / 14%); }.price-line-down .price-line-area { fill: rgb(199 67 67 / 12%); }.price-line-path { fill: none; stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }.price-line-up .price-line-path { stroke: #24985e; }.price-line-down .price-line-path { stroke: #c74343; }
.listing-panel { min-width: 0; overflow: hidden; border: 1px solid #e2e7dd; background: #fafbf8; }.listing-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 13px; border-bottom: 1px solid #e2e7dd; }.listing-panel-header > div > span { color: #8a9382; font: 7px 'DM Mono', monospace; letter-spacing: .7px; }.listing-panel-header h3 { margin-top: 4px; color: #283025; font: 700 14px Manrope, sans-serif; }.listing-count { color: #75816e; font: 7px 'DM Mono', monospace; }.venue-list { display: grid; }.venue-item { display: grid; grid-template-columns: 31px minmax(0, 1fr) auto; align-items: center; gap: 9px; min-height: 67px; padding: 9px 11px; border-bottom: 1px solid #e8ebe5; }.venue-item:last-child { border-bottom: 0; }.venue-logo { display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid rgb(0 0 0 / 6%); border-radius: 9px; font: 800 9px Manrope, sans-serif; letter-spacing: -.3px; }.venue-logo-theme-0 { background: #e9e3ff; color: #6847ac; }.venue-logo-theme-1 { background: #dff2ea; color: #287353; }.venue-logo-theme-2 { background: #e3efff; color: #3768ad; }.venue-logo-theme-3 { background: #fff0d8; color: #94671f; }.venue-logo-theme-4 { background: #fde3e1; color: #a6463c; }.venue-logo-theme-5 { background: #e0f3f7; color: #327587; }.venue-details { display: grid; min-width: 0; gap: 3px; }.venue-details strong { overflow: hidden; color: #354030; font: 700 10px Manrope, sans-serif; text-overflow: ellipsis; white-space: nowrap; }.venue-details > span { color: #899283; font: 7px 'DM Mono', monospace; }.venue-details a { width: fit-content; color: #5c7543; font: 7px 'DM Mono', monospace; text-decoration: none; }.venue-details a:hover { text-decoration: underline; }.venue-liquidity { color: #354030; font: 600 9px 'DM Mono', monospace; text-align: right; white-space: nowrap; }.venue-liquidity small { display: block; margin-top: 4px; color: #92998f; font-size: 6px; }.listing-empty { padding: 25px 15px; color: #858d80; font-size: 10px; text-align: center; }.listing-source { display: block; padding: 10px 12px; border-top: 1px solid #e2e7dd; color: #92998d; font: 7px 'DM Mono', monospace; line-height: 1.5; }
.detail-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 0; border-top: 1px solid #e8ebe5; border-left: 1px solid #e8ebe5; }.detail-metrics article { display: grid; min-height: 70px; align-content: center; gap: 7px; padding: 11px 13px; border-right: 1px solid #e8ebe5; border-bottom: 1px solid #e8ebe5; }.detail-metrics article > span { color: #879082; font: 8px 'DM Mono', monospace; }.detail-metrics article > strong { overflow: hidden; color: #293126; font: 600 15px Manrope, sans-serif; text-overflow: ellipsis; white-space: nowrap; }.detail-metrics article > small { color: #879082; font: 7px 'DM Mono', monospace; }
.detail-risk { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 11px 12px; border: 1px solid #e4e8df; background: #fafbf8; }.detail-risk > span { display: grid; width: 23px; height: 23px; flex: 0 0 auto; place-items: center; border: 1px solid currentColor; border-radius: 50%; font-size: 13px; }.detail-risk > div { min-width: 0; }.detail-risk strong,.detail-risk small { display: block; }.detail-risk strong { font: 700 9px 'DM Mono', monospace; }.detail-risk small { overflow: hidden; max-width: 420px; margin-top: 4px; color: #7e8778; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.detail-risk button { min-height: 30px; margin-left: auto; padding: 0 9px; border: 1px solid #dce2d2; background: #f7f9f1; color: #4e6238; font: 8px 'DM Mono', monospace; }.detail-risk button:disabled { cursor: not-allowed; opacity: .65; }.risk-danger { color: #ac3930; }.risk-caution { color: #96701e; }.risk-limited { color: #767e72; }.risk-clear { color: #577542; }
.detail-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 23px; border-top: 1px solid #e5e9e1; color: #90978d; font-size: 8px; }.detail-footer > div { display: flex; align-items: center; gap: 8px; }.detail-footer a,.detail-copy { min-height: 29px; display: inline-flex; align-items: center; justify-content: center; padding: 0 9px; border: 1px solid #dce2d2; background: #f7f9f1; color: #4e6238; font: 8px 'DM Mono', monospace; text-decoration: none; }.detail-copy { background: #fff; }
@keyframes detail-spin { to { transform: rotate(360deg); } }
@keyframes market-price-up { 0%,100% { color: inherit; text-shadow: none; } 15%,55%,90% { color: #22a96d; text-shadow: 0 0 12px rgb(34 169 109 / 38%); } 35%,75% { color: inherit; text-shadow: none; } }
@keyframes market-price-down { 0%,100% { color: inherit; text-shadow: none; } 15%,55%,90% { color: #df554f; text-shadow: 0 0 12px rgb(223 85 79 / 38%); } 35%,75% { color: inherit; text-shadow: none; } }
@media (prefers-reduced-motion: reduce) { .chart-price.price-up,.chart-price.price-down { animation: none; } }
@media (max-width: 760px) { .metrics-market-layout { grid-template-columns: minmax(0, 1fr); }.venue-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }.venue-item:nth-child(odd) { border-right: 1px solid #e8ebe5; } }
@media (max-width: 620px) { .market-detail-overlay { align-items: end; padding: 0; }.market-detail-dialog { width: 100%; max-height: 94vh; border-right: 0; border-bottom: 0; border-left: 0; }.detail-header { padding: 15px 13px; }.detail-body { padding: 12px; }.detail-identity { gap: 9px; }.detail-identity img,.detail-monogram { width: 37px; height: 37px; }.detail-identity h2 { max-width: 68vw; font-size: 16px; }.detail-identity code { max-width: 68vw; font-size: 8px; }.price-chart-section { padding: 12px 10px; }.chart-heading strong { font-size: 21px; }.price-chart svg { height: 170px; }.chart-controls { flex-wrap: wrap; }.chart-controls > span { width: 100%; }.detail-metrics article { min-height: 62px; padding: 9px; }.detail-metrics article > span { font-size: 7px; }.detail-metrics article > strong { font-size: 12px; }.detail-risk { flex-wrap: wrap; }.detail-risk small { max-width: calc(100vw - 90px); }.detail-risk button { margin-left: 33px; }.detail-footer { align-items: flex-start; flex-direction: column; padding: 11px 12px; }.detail-footer > div { width: 100%; }.detail-footer a,.detail-copy { flex: 1; }.venue-list { grid-template-columns: minmax(0, 1fr); }.venue-item:nth-child(odd) { border-right: 0; } }
</style>