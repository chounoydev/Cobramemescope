<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { Coin, CoinMarketDetails } from '../lib/api'
import { fetchMarketCoinDetails } from '../lib/api'
import { formatCurrency, selectedCurrency } from '../lib/currency'

const props = defineProps<{ coin: Coin | null }>()
const emit = defineEmits<{ close: [] }>()

const ranges = [
  { days: 1, label: '24H' },
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
] as const
const selectedDays = ref<number>(1)
const details = ref<CoinMarketDetails | null>(null)
const loading = ref(false)
const error = ref('')
const retryKey = ref(0)
let activeRequest: AbortController | null = null

watch(() => [props.coin?.id, selectedDays.value, retryKey.value] as const, async ([id]) => {
  activeRequest?.abort()
  details.value = null
  error.value = ''
  if (!id || !props.coin) {
    loading.value = false
    return
  }

  const controller = new AbortController()
  activeRequest = controller
  loading.value = true
  try {
    details.value = await fetchMarketCoinDetails(id, selectedDays.value, controller.signal)
  } catch (requestError) {
    if (!controller.signal.aborted) error.value = requestError instanceof Error ? requestError.message : 'Market details could not be loaded.'
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}, { immediate: true })

onUnmounted(() => activeRequest?.abort())

const displayCoin = computed(() => details.value?.coin || props.coin)
const points = computed(() => {
  const source = details.value?.points || []
  if (source.length <= 120) return source
  const step = (source.length - 1) / 119
  return Array.from({ length: 120 }, (_, index) => source[Math.round(index * step)]!)
})
const chartCoordinates = computed(() => {
  if (!points.value.length) return []
  const values = points.value.map((point) => point.priceUsd)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || Math.max(max * 0.01, Number.EPSILON)
  return points.value.map((point, index) => ({
    ...point,
    x: 42 + (index / Math.max(points.value.length - 1, 1)) * 636,
    y: 20 + ((max - point.priceUsd) / spread) * 158,
  }))
})
const chartLine = computed(() => chartCoordinates.value.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' '))
const chartArea = computed(() => {
  const coordinates = chartCoordinates.value
  if (!coordinates.length) return ''
  const first = coordinates[0]!
  const last = coordinates[coordinates.length - 1]!
  return `${chartLine.value} L ${last.x.toFixed(2)} 198 L ${first.x.toFixed(2)} 198 Z`
})
const chartRange = computed(() => ranges.find((range) => range.days === selectedDays.value)?.label || '24H')

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return formatCurrency(value)
}

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '—'
  if (value > 0 && value < 0.01) return formatPrice(value)
  return formatCurrency(value, true)
}

function formatSupply(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

function retry() {
  retryKey.value += 1
}
</script>

<template>
  <Teleport to="body">
    <div v-if="coin" class="coin-detail-overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
      <section class="coin-detail-dialog" role="dialog" aria-modal="true" :aria-label="`${coin.name} market details`">
        <header class="coin-detail-header">
          <div class="coin-detail-identity">
            <img :src="coin.image" alt="" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
            <div><span>COINGECKO MARKET DATA · RANK #{{ displayCoin?.rank || coin.rank }}</span><h2>{{ displayCoin?.name || coin.name }} <small>{{ displayCoin?.symbol || coin.symbol }}</small></h2></div>
          </div>
          <button class="coin-detail-close" type="button" aria-label="Close market details" @click="emit('close')">×</button>
        </header>

        <div class="coin-detail-body">
          <section class="coin-chart-section" :aria-label="`${chartRange} price chart`">
            <div class="coin-chart-heading">
              <div><span>{{ selectedCurrency }} PRICE · {{ chartRange }}</span><strong>{{ formatPrice(displayCoin?.price) }}</strong></div>
              <span class="coin-chart-change" :class="(displayCoin?.change24h || 0) >= 0 ? 'positive' : 'negative'">{{ (displayCoin?.change24h || 0) >= 0 ? '+' : '' }}{{ (displayCoin?.change24h || 0).toFixed(2) }}%</span>
            </div>
            <nav class="coin-chart-ranges" aria-label="Chart range">
              <button v-for="range in ranges" :key="range.days" type="button" :class="{ active: selectedDays === range.days }" :aria-pressed="selectedDays === range.days" @click="selectedDays = range.days">{{ range.label }}</button>
            </nav>
            <div v-if="loading && points.length === 0" class="coin-chart-empty" role="status"><span class="detail-spinner"></span> Loading price history…</div>
            <div v-else-if="points.length > 1" class="coin-price-chart">
              <svg viewBox="0 0 720 230" role="img" :aria-label="`${chartRange} price chart for ${coin.name}`" preserveAspectRatio="none">
                <defs><linearGradient :id="`coin-chart-fill-${coin.id}`" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#d5e77d" stop-opacity=".34" /><stop offset="100%" stop-color="#d5e77d" stop-opacity="0" /></linearGradient></defs>
                <line v-for="y in [20, 75, 130, 198]" :key="y" x1="42" :y1="y" x2="678" :y2="y" class="coin-chart-gridline" />
                <path :d="chartArea" :fill="`url(#coin-chart-fill-${coin.id})`" />
                <path :d="chartLine" class="coin-chart-line" />
                <circle v-for="(point, index) in chartCoordinates" :key="point.timestamp" v-show="index === chartCoordinates.length - 1" :cx="point.x" :cy="point.y" r="4" class="coin-chart-dot"><title>{{ formatPrice(point.priceUsd) }} · {{ new Date(point.timestamp).toLocaleString() }}</title></circle>
              </svg>
              <div class="coin-chart-axis"><span>{{ new Date(points[0]!.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' }) }}</span><span>{{ new Date(points[Math.floor(points.length / 2)]!.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' }) }}</span><span>Now</span></div>
            </div>
            <div v-else class="coin-chart-empty">Price history is not available for this range.</div>
            <p v-if="error" class="coin-detail-error" role="alert">{{ error }} <button type="button" @click="retry">RETRY</button></p>
            <small class="coin-chart-source">Historical price from CoinGecko · Values are snapshots, not execution quotes.</small>
          </section>

          <section class="coin-detail-metrics" aria-label="Market metrics">
            <article><span>MARKET CAP</span><strong>{{ formatUsd(displayCoin?.marketCap) }}</strong></article>
            <article><span>FULLY DILUTED VALUE</span><strong>{{ formatUsd(displayCoin?.fullyDilutedValuation) }}</strong></article>
            <article><span>24H VOLUME</span><strong>{{ formatUsd(displayCoin?.volume) }}</strong></article>
            <article><span>24H HIGH</span><strong>{{ formatPrice(displayCoin?.high24h) }}</strong></article>
            <article><span>24H LOW</span><strong>{{ formatPrice(displayCoin?.low24h) }}</strong></article>
            <article><span>CIRCULATING SUPPLY</span><strong>{{ formatSupply(displayCoin?.circulatingSupply) }}</strong></article>
          </section>
          <p class="coin-liquidity-note"><strong>Liquidity:</strong> Exchange liquidity is not aggregated for this market listing. Check an individual DEX/CEX pair for pool depth before trading.</p>
        </div>
        <footer class="coin-detail-footer"><span>Data refreshes with the market feed. Always verify before trading.</span><button type="button" @click="emit('close')">DONE</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.coin-detail-overlay { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; overflow-y: auto; padding: 24px; background: rgb(18 25 19 / 68%); backdrop-filter: blur(4px); }
.coin-detail-dialog { width: min(100%, 820px); max-height: min(90vh, 900px); overflow-y: auto; border: 1px solid #d7ded0; background: #fff; box-shadow: 0 24px 80px rgb(0 0 0 / 28%); }
.coin-detail-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 19px 23px; border-bottom: 1px solid #e5e9e1; }.coin-detail-identity { display: flex; min-width: 0; align-items: center; gap: 13px; }.coin-detail-identity img { width: 43px; height: 43px; flex: 0 0 auto; border: 1px solid #edf0e8; border-radius: 50%; background: #f4f6f1; object-fit: cover; }.coin-detail-identity div { min-width: 0; }.coin-detail-identity span { color: #858d80; font: 8px 'DM Mono', monospace; letter-spacing: .5px; }.coin-detail-identity h2 { overflow: hidden; margin-top: 5px; color: #242b22; font: 700 19px Manrope, sans-serif; text-overflow: ellipsis; white-space: nowrap; }.coin-detail-identity h2 small { color: #879080; font: 10px 'DM Mono', monospace; }.coin-detail-close { width: 31px; height: 31px; flex: 0 0 auto; border: 1px solid #e1e6dc; background: #f7f8f4; color: #586252; font-size: 20px; }
.coin-detail-body { padding: 19px 23px 20px; }.coin-chart-section { padding: 16px 17px 12px; border: 1px solid #e2e7dd; background: #fafbf8; }.coin-chart-heading { display: flex; align-items: flex-end; justify-content: space-between; }.coin-chart-heading > div { display: grid; gap: 6px; }.coin-chart-heading > div > span { color: #869080; font: 8px 'DM Mono', monospace; letter-spacing: .6px; }.coin-chart-heading strong { color: #20271e; font: 700 24px Manrope, sans-serif; }.coin-chart-change { padding: 5px 8px; font: 10px 'DM Mono', monospace; }.coin-chart-change.positive { background: #edf4e6; color: #50763b; }.coin-chart-change.negative { background: #faece9; color: #a3483f; }.coin-chart-ranges { display: flex; gap: 5px; margin-top: 13px; }.coin-chart-ranges button { min-width: 39px; padding: 6px 8px; border: 1px solid transparent; background: transparent; color: #818a7d; font: 8px 'DM Mono', monospace; }.coin-chart-ranges button.active { border-color: #dce3d1; background: #edf2e5; color: #526a3b; }.coin-price-chart { margin-top: 3px; }.coin-price-chart svg { display: block; width: 100%; height: 205px; overflow: visible; }.coin-chart-gridline { stroke: #e7ebe3; stroke-dasharray: 3 5; stroke-width: 1; }.coin-chart-line { fill: none; stroke: #748c4d; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.5; }.coin-chart-dot { fill: #d5e77d; stroke: #627942; stroke-width: 2; }.coin-chart-axis { display: flex; justify-content: space-between; padding: 0 4px 0 6%; color: #92998d; font: 8px 'DM Mono', monospace; }.coin-chart-empty { display: flex; min-height: 170px; align-items: center; justify-content: center; gap: 10px; color: #8a9186; font-size: 11px; }.detail-spinner { width: 17px; height: 17px; border: 2px solid #dce4d3; border-top-color: #71864f; border-radius: 50%; animation: coin-spin .8s linear infinite; }.coin-chart-source { display: block; margin-top: 10px; color: #92998d; font: 8px 'DM Mono', monospace; }.coin-detail-error { margin-top: 10px; color: #a64238; font-size: 10px; }.coin-detail-error button { margin-left: 6px; padding: 3px 6px; border: 1px solid #e9c9c4; background: #fff; color: #a64238; font: 8px 'DM Mono', monospace; }
.coin-detail-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 14px; border-top: 1px solid #e8ebe5; border-left: 1px solid #e8ebe5; }.coin-detail-metrics article { display: grid; min-height: 70px; align-content: center; gap: 7px; padding: 11px 13px; border-right: 1px solid #e8ebe5; border-bottom: 1px solid #e8ebe5; }.coin-detail-metrics article > span { color: #879082; font: 8px 'DM Mono', monospace; }.coin-detail-metrics article > strong { overflow: hidden; color: #293126; font: 600 15px Manrope, sans-serif; text-overflow: ellipsis; white-space: nowrap; }.coin-liquidity-note { margin: 12px 0 0; padding: 10px 12px; border: 1px solid #eee6d1; background: #fcfaf4; color: #777565; font-size: 9px; line-height: 1.6; }.coin-liquidity-note strong { color: #69654e; }
.coin-detail-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 23px; border-top: 1px solid #e5e9e1; color: #90978d; font-size: 8px; }.coin-detail-footer button { min-height: 29px; padding: 0 12px; border: 1px solid #dce2d2; background: #f7f9f1; color: #4e6238; font: 8px 'DM Mono', monospace; }
@keyframes coin-spin { to { transform: rotate(360deg); } }
@media (max-width: 620px) { .coin-detail-overlay { align-items: end; padding: 0; }.coin-detail-dialog { width: 100%; max-height: 94vh; border-right: 0; border-bottom: 0; border-left: 0; }.coin-detail-header { padding: 15px 13px; }.coin-detail-body { padding: 12px; }.coin-detail-identity { gap: 9px; }.coin-detail-identity img { width: 37px; height: 37px; }.coin-detail-identity h2 { max-width: 68vw; font-size: 16px; }.coin-chart-section { padding: 12px 10px; }.coin-chart-heading strong { font-size: 21px; }.coin-price-chart svg { height: 170px; }.coin-detail-metrics article { min-height: 62px; padding: 9px; }.coin-detail-metrics article > span { font-size: 7px; }.coin-detail-metrics article > strong { font-size: 12px; }.coin-detail-footer { align-items: flex-start; flex-direction: column; padding: 11px 12px; }.coin-detail-footer button { width: 100%; } }
</style>
