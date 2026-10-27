<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchWalletHoldings, type WalletTokenHolding } from '../lib/api'
import { formatCurrency } from '../lib/currency'

const props = defineProps<{ token: string }>()
const holdings = ref<WalletTokenHolding[]>([])
const unavailableChains = ref<string[]>([])
const error = ref('')
const loading = ref(false)
const totalValueUsd = computed(() => holdings.value.reduce((total, holding) => total + holding.valueUsd, 0))
let refreshTimer = 0

async function refreshHoldings() {
  if (loading.value) return
  loading.value = true
  try {
    const result = await fetchWalletHoldings(props.token)
    holdings.value = result.holdings
    unavailableChains.value = result.unavailableChains
    error.value = ''
  } catch (refreshError) {
    error.value = refreshError instanceof Error ? refreshError.message : 'Could not load wallet holdings.'
  } finally {
    loading.value = false
  }
}

function formatUsd(value: number) {
  return formatCurrency(value)
}

function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 }).format(value)
}

onMounted(() => {
  void refreshHoldings()
  refreshTimer = window.setInterval(() => { void refreshHoldings() }, 60_000)
})

onBeforeUnmount(() => window.clearInterval(refreshTimer))
</script>

<template>
  <section class="wallet-holdings" aria-label="Wallet meme-token holdings">
    <header class="holdings-header">
      <div><span class="holdings-eyebrow">WALLET TRACKER</span><h3>Meme-token holdings</h3></div>
      <button type="button" :disabled="loading" aria-label="Refresh wallet holdings" @click="refreshHoldings">{{ loading ? '…' : '↻' }}</button>
    </header>
    <p v-if="error" class="holdings-error" role="alert">{{ error }}</p>
    <template v-else>
      <p v-if="unavailableChains.length" class="holdings-warning">Could not check: {{ unavailableChains.join(', ') }}.</p>
      <div v-if="holdings.length" class="holdings-total">
        <div><small>ESTIMATED TOKEN VALUE</small><strong>{{ formatUsd(totalValueUsd) }}</strong></div>
        <span>{{ holdings.length }} {{ holdings.length === 1 ? 'asset' : 'assets' }}</span>
      </div>
      <ul v-if="holdings.length" class="holdings-list">
        <li v-for="holding in holdings" :key="`${holding.chainId}:${holding.address}`">
          <img v-if="holding.image" :src="holding.image" alt="" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
          <span v-else class="holding-avatar">{{ holding.symbol.slice(0, 1) }}</span>
          <div class="holding-token">
            <strong>{{ holding.symbol }}</strong>
            <small>{{ holding.name }} · {{ holding.chain }}</small>
          </div>
          <div class="holding-position">
            <strong>{{ formatUsd(holding.valueUsd) }}</strong>
            <small :class="holding.change24h === null ? '' : holding.change24h >= 0 ? 'holding-up' : 'holding-down'">{{ formatAmount(holding.amount) }} · {{ holding.change24h === null ? '24h movement unavailable' : `${holding.change24h > 0 ? '+' : ''}${holding.change24h.toFixed(2)}% 24h` }}</small>
          </div>
          <a v-if="holding.pairUrl" :href="holding.pairUrl" target="_blank" rel="noreferrer" :aria-label="`Open ${holding.symbol} market`">↗</a>
        </li>
      </ul>
      <p v-if="holdings.length" class="holdings-disclaimer">24-hour market price movement, not personal profit/loss. Balances and prices may be delayed.</p>
      <p v-else-if="!loading" class="holdings-empty">No meme-token balances with a current market price were found.</p>
    </template>
  </section>
</template>

<style scoped>
.wallet-holdings { margin-top: 16px; padding: 13px; border: 1px solid #303830; border-radius: 12px; background: #171e18; }
.holdings-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.holdings-eyebrow { color: #a3c94d; font-size: 9px; font-weight: 800; letter-spacing: .12em; }
.holdings-header h3 { margin: 3px 0 0; font-size: 14px; }
.holdings-header button { width: 30px; height: 30px; border: 1px solid #394238; border-radius: 8px; background: #202820; color: #c7eb6c; font-size: 18px; cursor: pointer; }
.holdings-header button:disabled { opacity: .6; cursor: wait; }
.holdings-total { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-top: 12px; padding: 11px; border: 1px solid #3b4736; border-radius: 9px; background: linear-gradient(120deg, #263323, #1d271f); }
.holdings-total div { display: grid; gap: 4px; }
.holdings-total small { color: #a8b399; font-size: 8px; font-weight: 800; letter-spacing: .1em; }
.holdings-total strong { color: #e6f4ce; font-size: 18px; letter-spacing: -.03em; }
.holdings-total span { color: #aeb8a6; font-size: 10px; }
.holdings-list { display: grid; gap: 8px; max-height: 250px; overflow-y: auto; margin: 11px 0 0; padding: 0; list-style: none; }
.holdings-list li { display: flex; min-width: 0; align-items: center; gap: 9px; padding: 7px; border-radius: 8px; background: #202820; }
.holdings-list img,.holding-avatar { width: 30px; height: 30px; flex: 0 0 30px; border-radius: 50%; background: #37452c; color: #c7eb6c; object-fit: cover; }
.holding-avatar { display: grid; place-items: center; font-size: 12px; font-weight: 800; }
.holding-token,.holding-position { display: grid; min-width: 0; gap: 3px; }
.holding-token { flex: 1; }
.holding-token strong,.holding-position strong { overflow: hidden; color: #edf2e8; font-size: 11px; text-overflow: ellipsis; }
.holding-token small,.holding-position small { overflow: hidden; color: #a3ab9f; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.holding-position { text-align: right; }
.holding-position .holding-up { color: #a9d77b; }.holding-position .holding-down { color: #ed9990; }
.holdings-list a { color: #c7eb6c; font-size: 15px; text-decoration: none; }
.holdings-disclaimer,.holdings-warning { margin: 9px 0 0; color: #929b90; font-size: 9px; line-height: 1.5; }
.holdings-warning { color: #e4c983; }
.holdings-error { margin: 10px 0 0; color: #e4c983; font-size: 10px; line-height: 1.5; }
.holdings-empty { margin: 12px 0 2px; color: #a3ab9f; font-size: 10px; line-height: 1.5; }
</style>
