<script setup lang="ts">
import { ref } from 'vue'
import TokenLogo from './TokenLogo.vue'
import type { TrendingMemecoin } from '../lib/api'
import { formatCurrency } from '../lib/currency'

const props = defineProps<{
  coins: TrendingMemecoin[]
  watchlistKeys?: string[]
  liquidityChanges?: Record<string, { amount: number; percent: number } | null>
}>()

const emit = defineEmits<{
  scan: [address: string]
  watchlistToggle: [coin: TrendingMemecoin]
  select: [coin: TrendingMemecoin]
}>()

const copiedAddress = ref('')

function coinKey(coin: TrendingMemecoin) {
  return `${coin.chainId}:${coin.address}`
}

function liquidityChange(coin: TrendingMemecoin) {
  return props.liquidityChanges?.[coinKey(coin)] ?? null
}

function liquidityTrackingLabel(coin: TrendingMemecoin) {
  return props.liquidityChanges && Object.hasOwn(props.liquidityChanges, coinKey(coin))
    ? 'Baseline captured; change appears after the next feed refresh'
    : 'No recent liquidity snapshot'
}

function chainThemeClass(chainId: string, chainName: string) {
  const aliases: Record<string, string> = {
    'binance-smart-chain': 'bsc',
    'bnb-chain': 'bsc',
    'avax': 'avalanche',
  }
  const supportedChains = new Set([
    'solana', 'ethereum', 'base', 'bsc', 'polygon', 'arbitrum', 'avalanche',
    'optimism', 'sui', 'ton', 'tron', 'aptos', 'linea', 'sonic', 'blast',
    'mantle', 'celo', 'fantom', 'robinhood',
  ])
  const chain = chainId.toLowerCase()
  const normalized = aliases[chain] || (supportedChains.has(chain) ? chain : chainName.toLowerCase())
  return `chain-${supportedChains.has(normalized) ? normalized : 'default'}`
}

async function copyAddress(address: string) {
  try {
    await navigator.clipboard.writeText(address)
    copiedAddress.value = address
    window.setTimeout(() => {
      if (copiedAddress.value === address) copiedAddress.value = ''
    }, 1500)
  } catch {
    copiedAddress.value = ''
  }
}

function formatUsd(value: number) {
  return formatCurrency(value, true)
}

function formatAge(hours: number) {
  if (hours < 1) return '<1h'
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
</script>

<template>
  <div class="trending-table-wrap">
    <table class="trending-table">
      <thead>
        <tr><th>#</th><th>Token</th><th>Chain</th><th>Market cap</th><th>Pool age</th><th>24h move</th><th>Liquidity</th><th>24h volume</th><th>Buys / sells</th><th>Risk review</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="coin in coins" :key="`${coin.chainId}:${coin.address}`" :class="{ 'boosted-row': coin.promoted }" title="Open market chart and details" @click="emit('select', coin)">
          <td class="rank-cell">{{ String(coin.rank).padStart(2, '0') }}</td>
          <td class="token-cell">
            <TokenLogo :src="coin.image" :symbol="coin.symbol" :address="coin.address" :size="29" />
            <div><div class="token-name-line"><button class="token-detail-trigger" type="button" :aria-label="`View ${coin.name} market details`" @click.stop="emit('select', coin)">{{ coin.name }}</button><span v-if="coin.promoted" class="boost-tag" title="This token appears in DexScreener's boosted listings">BOOSTED</span></div><span>{{ coin.symbol }} · {{ coin.address.slice(0, 5) }}…{{ coin.address.slice(-4) }}</span></div>
          </td>
          <td><span class="chain-tag" :class="chainThemeClass(coin.chainId, coin.chain)">{{ coin.chain }}</span></td>
          <td class="numeric-cell">{{ coin.marketCapUsd == null ? '—' : formatUsd(coin.marketCapUsd) }}</td>
          <td class="numeric-cell">{{ formatAge(coin.ageHours) }}</td>
          <td class="move-cell" :class="coin.change24h >= 0 ? 'move-up' : 'move-down'">{{ coin.change24h >= 0 ? '+' : '' }}{{ coin.change24h.toFixed(1) }}%<small>{{ coin.momentumLabel }}<span v-if="coin.marketStatus && !coin.momentumLabel.includes(coin.marketStatus)"> · {{ coin.marketStatus }}</span></small></td>
          <td class="liquidity-cell" :class="coin.liquidityUsd < 10_000 ? 'low-liquidity' : ''">
            <strong>{{ formatUsd(coin.liquidityUsd) }}</strong>
            <small v-if="liquidityChange(coin)" :class="liquidityChange(coin)!.amount > 0 ? 'liquidity-up' : liquidityChange(coin)!.amount < 0 ? 'liquidity-down' : 'liquidity-flat'" :title="`Liquidity change since the previous feed refresh: ${liquidityChange(coin)!.percent > 0 ? '+' : ''}${liquidityChange(coin)!.percent.toFixed(2)}%`">
              {{ liquidityChange(coin)!.amount > 0 ? '↑' : liquidityChange(coin)!.amount < 0 ? '↓' : '↔' }} {{ formatUsd(Math.abs(liquidityChange(coin)!.amount)) }} · {{ liquidityChange(coin)!.percent > 0 ? '+' : '' }}{{ liquidityChange(coin)!.percent.toFixed(1) }}%
            </small>
            <small v-else class="liquidity-baseline">{{ liquidityTrackingLabel(coin) }}</small>
          </td>
          <td class="numeric-cell">{{ formatUsd(coin.volume24h) }}</td>
          <td class="activity-cell">{{ coin.buys24h }} / {{ coin.sells24h }}</td>
          <td><div class="risk-cell" :class="`risk-${coin.risk.level}`"><span>{{ coin.risk.level === 'danger' ? '×' : coin.risk.level === 'caution' ? '△' : coin.risk.level === 'clear' ? '✓' : '?' }}</span><div><strong>{{ coin.risk.label }}</strong><small>{{ coin.risk.reasons.join(' · ') || `${coin.risk.unknownCount} unknown checks` }}</small></div></div></td>
          <td class="row-actions">
            <button class="watchlist-toggle" type="button" :class="{ saved: watchlistKeys?.includes(coinKey(coin)) }" :aria-label="watchlistKeys?.includes(coinKey(coin)) ? 'Remove from watchlist' : 'Add to watchlist'" :title="watchlistKeys?.includes(coinKey(coin)) ? 'Remove from watchlist' : 'Add to watchlist'" @click.stop="emit('watchlistToggle', coin)">{{ watchlistKeys?.includes(coinKey(coin)) ? '★' : '☆' }}</button>
            <button class="copy-address" type="button" :aria-label="copiedAddress === coin.address ? 'Address copied' : 'Copy token address'" :title="copiedAddress === coin.address ? 'Address copied' : 'Copy token address'" @click.stop="copyAddress(coin.address)">{{ copiedAddress === coin.address ? 'COPIED' : 'COPY' }}</button>
            <button class="review-action" type="button" :disabled="coin.chainId === 'sui'" :title="coin.chainId === 'sui' ? 'Sui contract risk scanning is not available yet.' : 'Open full contract risk scan'" @click.stop="emit('scan', coin.address)">{{ coin.chainId === 'sui' ? 'CHECK N/A' : 'REVIEW ↗' }}</button>
          </td>
        </tr>
        <tr v-if="coins.length === 0"><td colspan="11" class="table-empty">No launches match this view right now.</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.trending-table-wrap { container-type: inline-size; overflow-x: auto; border: 1px solid #dce0d7; background: #fff; }
.trending-table { width: 100%; min-width: 0; table-layout: fixed; border-collapse: collapse; white-space: nowrap; text-align: left; }
.trending-table th { height: 36px; padding: 0 7px; border-bottom: 1px solid #e5e8e1; background: #f8f9f5; color: #828a7f; font-family: 'DM Mono', monospace; font-size: 7px; font-weight: 500; letter-spacing: .5px; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; }
.trending-table td { height: 61px; padding: 0 7px; border-bottom: 1px solid #eef0eb; color: #626b60; font-size: 9px; overflow: hidden; text-overflow: ellipsis; }.trending-table tbody tr:last-child td { border-bottom: 0; }.trending-table tbody tr { cursor: pointer; }.trending-table tbody tr:hover { background: #fbfcf8; }
.trending-table th:nth-child(1) { width: 3%; }.trending-table th:nth-child(2) { width: 20%; }.trending-table th:nth-child(3) { width: 7%; }.trending-table th:nth-child(4) { width: 8%; }.trending-table th:nth-child(5) { width: 6%; }.trending-table th:nth-child(6) { width: 8%; }.trending-table th:nth-child(7) { width: 9%; }.trending-table th:nth-child(8) { width: 7%; }.trending-table th:nth-child(9) { width: 5%; }.trending-table th:nth-child(10) { width: 15%; }.trending-table th:nth-child(11) { width: 12%; }
.rank-cell { color: #9ba296 !important; font-family: 'DM Mono', monospace; font-size: 8px !important; }.token-cell { display: flex; min-width: 0; align-items: center; gap: 7px; }.token-cell img,.token-fallback { display: grid; width: 29px; height: 29px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: #e4edbf; color: #536637; object-fit: cover; font-family: Manrope, sans-serif; font-size: 11px; font-weight: 800; }.token-cell > div { min-width: 0; overflow: hidden; }.token-name-line { display: flex; align-items: center; gap: 5px; }.token-cell strong { max-width: 145px; overflow: hidden; color: #30382e; font-size: 9px; text-overflow: ellipsis; }.token-cell div > span:not(.boost-tag) { display: block; max-width: 155px; overflow: hidden; margin-top: 4px; color: #92998f; font-family: 'DM Mono', monospace; font-size: 7px; text-overflow: ellipsis; }.boost-tag { padding: 2px 4px; border: 1px solid #e2c562; background: transparent; color: #a77b08; font-family: 'DM Mono', monospace; font-size: 6px; font-weight: 700; letter-spacing: .3px; }
.token-detail-trigger { max-width: 145px; overflow: hidden; padding: 0; border: 0; background: transparent; color: #30382e; font-size: 9px; font-weight: 700; text-align: left; text-overflow: ellipsis; cursor: pointer; }.token-detail-trigger:hover { color: #617742; text-decoration: underline; }
.chain-tag { padding: 4px 6px; border: 1px solid #e2e6dc; background: #f9faf7; color: #687261; font-size: 8px; }.chain-solana { border-color: #cfc3ed; background: #f1edfa; color: #694ab1; }.chain-ethereum { border-color: #c6cce4; background: #edf0fa; color: #53649b; }.chain-base { border-color: #b9cdf4; background: #edf3ff; color: #315dbe; }.chain-bsc { border-color: #e6d39c; background: #fbf5df; color: #8c6a13; }.chain-polygon { border-color: #ddc4ed; background: #f6effb; color: #8246a8; }.chain-arbitrum { border-color: #b9d5e2; background: #edf6f9; color: #3d7188; }.chain-avalanche { border-color: #efc1bf; background: #fff0ef; color: #b13d3d; }.chain-optimism { border-color: #efc1bf; background: #fff0ef; color: #b13d3d; }.chain-sui { border-color: #b8d9ed; background: #edf7fc; color: #30769a; }.chain-ton { border-color: #b8d9ed; background: #edf7fc; color: #30769a; }.chain-tron { border-color: #efc1bf; background: #fff0ef; color: #b13d3d; }.chain-aptos { border-color: #d6d9d4; background: #f2f3f1; color: #515a53; }.chain-linea { border-color: #d6d9d4; background: #f2f3f1; color: #515a53; }.chain-sonic { border-color: #bce3da; background: #eef9f5; color: #267d67; }.chain-blast { border-color: #e5d3ad; background: #fbf6e9; color: #886323; }.chain-mantle { border-color: #d8d0c5; background: #f6f2ec; color: #76634b; }.chain-celo { border-color: #c7ddaa; background: #f2f8e9; color: #5c7b36; }.chain-fantom { border-color: #b9d5e2; background: #edf6f9; color: #3d7188; }.chain-robinhood { border-color: #c7ddaa; background: #f2f8e9; color: #547d2c; }.numeric-cell,.activity-cell { color: #555f52 !important; font-family: 'DM Mono', monospace; font-size: 8px !important; }.move-cell { font-family: 'DM Mono', monospace; font-size: 9px !important; }.move-cell small { display: block; margin-top: 4px; color: #92998e; font-family: 'DM Sans', sans-serif; font-size: 7px; }.move-up { color: #577b38 !important; }.move-down { color: #ac5549 !important; }.low-liquidity { color: #a56c16 !important; }
.risk-cell { display: flex; min-width: 0; align-items: center; gap: 7px; }.risk-cell > span { display: grid; width: 19px; height: 19px; flex: 0 0 auto; place-items: center; border: 1px solid currentColor; border-radius: 50%; font-size: 11px; font-weight: 800; }.risk-cell > div { min-width: 0; overflow: hidden; }.risk-cell strong,.risk-cell small { display: block; overflow: hidden; text-overflow: ellipsis; }.risk-cell strong { font-family: 'DM Mono', monospace; font-size: 7px; font-weight: 600; }.risk-cell small { max-width: 160px; margin-top: 3px; color: #8b9288; font-size: 7px; }.risk-danger { color: #ac3930; }.risk-caution { color: #96701e; }.risk-limited { color: #767e72; }.risk-clear { color: #577542; }.row-actions { display: flex; align-items: center; gap: 4px; }.row-actions button { min-height: 29px; padding: 6px 7px; border: 1px solid #dce2d2; background: #f7f9f1; color: #4d6038; font-family: 'DM Mono', monospace; font-size: 7px; font-weight: 700; }.row-actions button:hover { background: #eaf0dc; }.row-actions button:disabled { cursor: not-allowed; opacity: .55; }.row-actions .watchlist-toggle { width: 29px; padding: 0; color: #99a18f; font-size: 15px; }.row-actions .watchlist-toggle.saved { color: #ad8431; }.row-actions .copy-address { background: #fff; color: #616b59; }.table-empty { height: 86px !important; text-align: center; color: #828a7e !important; font-size: 10px !important; }
@media (max-width: 1120px) {
  .trending-table th:nth-child(4), .trending-table td:nth-child(4),
  .trending-table th:nth-child(9), .trending-table td:nth-child(9) { display: none; }
  .trending-table th:nth-child(1) { width: 4%; }.trending-table th:nth-child(2) { width: 24%; }.trending-table th:nth-child(3) { width: 8%; }.trending-table th:nth-child(5) { width: 7%; }.trending-table th:nth-child(6) { width: 9%; }.trending-table th:nth-child(7) { width: 11%; }.trending-table th:nth-child(8) { width: 9%; }.trending-table th:nth-child(10) { width: 16%; }.trending-table th:nth-child(11) { width: 12%; }
}
@media (max-width: 900px) {
  .trending-table th:nth-child(3), .trending-table td:nth-child(3),
  .trending-table th:nth-child(5), .trending-table td:nth-child(5) { display: none; }
  .trending-table th:nth-child(1) { width: 4%; }.trending-table th:nth-child(2) { width: 30%; }.trending-table th:nth-child(6) { width: 12%; }.trending-table th:nth-child(7) { width: 14%; }.trending-table th:nth-child(8) { width: 12%; }.trending-table th:nth-child(10) { width: 18%; }.trending-table th:nth-child(11) { width: 10%; }
}
@media (max-width: 700px) {
  .trending-table th:nth-child(8), .trending-table td:nth-child(8) { display: none; }
  .trending-table th:nth-child(1) { width: 4%; }.trending-table th:nth-child(2) { width: 35%; }.trending-table th:nth-child(6) { width: 15%; }.trending-table th:nth-child(7) { width: 18%; }.trending-table th:nth-child(10) { width: 19%; }.trending-table th:nth-child(11) { width: 9%; }
  .liquidity-cell small { display: none; }.risk-cell small { display: none; }
}
@media (max-width: 560px) {
  .trending-table th:nth-child(1), .trending-table td:nth-child(1) { display: none; }
  .trending-table th:nth-child(2) { width: 37%; }.trending-table th:nth-child(6) { width: 16%; }.trending-table th:nth-child(7) { width: 20%; }.trending-table th:nth-child(10) { width: 18%; }.trending-table th:nth-child(11) { width: 9%; }
  .row-actions .copy-address, .row-actions .review-action { display: none; }
  .token-cell { gap: 5px; }.token-cell img,.token-fallback { width: 24px; height: 24px; }.risk-cell { gap: 4px; }.risk-cell > span { width: 17px; height: 17px; }
}
@container (max-width: 1120px) {
  .trending-table th:nth-child(4), .trending-table td:nth-child(4),
  .trending-table th:nth-child(9), .trending-table td:nth-child(9) { display: none; }
  .trending-table th:nth-child(1) { width: 4%; }.trending-table th:nth-child(2) { width: 24%; }.trending-table th:nth-child(3) { width: 8%; }.trending-table th:nth-child(5) { width: 7%; }.trending-table th:nth-child(6) { width: 9%; }.trending-table th:nth-child(7) { width: 11%; }.trending-table th:nth-child(8) { width: 9%; }.trending-table th:nth-child(10) { width: 16%; }.trending-table th:nth-child(11) { width: 12%; }
}
@container (max-width: 900px) {
  .trending-table th:nth-child(3), .trending-table td:nth-child(3),
  .trending-table th:nth-child(5), .trending-table td:nth-child(5) { display: none; }
  .trending-table th:nth-child(1) { width: 4%; }.trending-table th:nth-child(2) { width: 30%; }.trending-table th:nth-child(6) { width: 12%; }.trending-table th:nth-child(7) { width: 14%; }.trending-table th:nth-child(8) { width: 12%; }.trending-table th:nth-child(10) { width: 18%; }.trending-table th:nth-child(11) { width: 10%; }
}
@container (max-width: 700px) {
  .trending-table th:nth-child(8), .trending-table td:nth-child(8) { display: none; }
  .trending-table th:nth-child(1) { width: 4%; }.trending-table th:nth-child(2) { width: 35%; }.trending-table th:nth-child(6) { width: 15%; }.trending-table th:nth-child(7) { width: 18%; }.trending-table th:nth-child(10) { width: 19%; }.trending-table th:nth-child(11) { width: 9%; }
  .liquidity-cell small { display: none; }.risk-cell small { display: none; }
}
@container (max-width: 560px) {
  .trending-table th:nth-child(1), .trending-table td:nth-child(1) { display: none; }
  .trending-table th:nth-child(2) { width: 37%; }.trending-table th:nth-child(6) { width: 16%; }.trending-table th:nth-child(7) { width: 20%; }.trending-table th:nth-child(10) { width: 18%; }.trending-table th:nth-child(11) { width: 9%; }
  .row-actions .copy-address, .row-actions .review-action { display: none; }
  .token-cell { gap: 5px; }.token-cell img,.token-fallback { width: 24px; height: 24px; }.risk-cell { gap: 4px; }.risk-cell > span { width: 17px; height: 17px; }
}
</style>