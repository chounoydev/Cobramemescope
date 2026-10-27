<script setup lang="ts">
import type { Coin } from '../lib/api'
import { formatCurrency } from '../lib/currency'

defineProps<{
  coins: Coin[]
  favorites: string[]
  loading: boolean
  filter: string
}>()

defineEmits<{
  select: [coin: Coin]
  toggleFavorite: [coinId: string]
  sort: [key: 'price' | 'change24h' | 'marketCap' | 'volume']
}>()

function formatMoney(value: number) {
  return formatCurrency(value)
}
</script>

<template>
  <div class="table-wrap">
    <table>
      <thead><tr><th class="rank-col">#</th><th>Asset</th><th><button class="sort-button" type="button" @click="$emit('sort', 'price')">Price <span>↕</span></button></th><th><button class="sort-button" type="button" @click="$emit('sort', 'change24h')">24h change <span>↕</span></button></th><th><button class="sort-button" type="button" @click="$emit('sort', 'marketCap')">Market cap <span>↕</span></button></th><th><button class="sort-button" type="button" @click="$emit('sort', 'volume')">Volume (24h) <span>↕</span></button></th><th class="action-col"></th></tr></thead>
      <tbody>
        <tr v-for="(coin, index) in coins" :key="coin.id">
          <td class="rank-col">{{ String(coin.rank).padStart(2, '0') }}</td>
          <td><div class="asset-cell"><img class="coin-avatar" :src="coin.image" :alt="''" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" /><button class="asset-name asset-detail-button" type="button" :aria-label="`View ${coin.name} market details`" @click="$emit('select', coin)"><strong>{{ coin.name }}</strong><span>{{ coin.symbol }}</span></button><span v-if="index < 3" class="hot-tag">HOT</span></div></td>
          <td class="price-cell">{{ formatMoney(coin.price) }}</td>
          <td><span class="change-pill" :class="coin.change24h >= 0 ? 'up' : 'down'">{{ coin.change24h >= 0 ? '+' : '' }}{{ coin.change24h.toFixed(2) }}%</span></td>
          <td class="data-cell">{{ formatCurrency(coin.marketCap, true) }}</td>
          <td class="data-cell">{{ formatCurrency(coin.volume, true) }}</td>
          <td class="action-col"><button class="star-button" :class="{ favorited: favorites.includes(coin.id) }" type="button" :aria-label="favorites.includes(coin.id) ? 'Remove from watchlist' : 'Add to watchlist'" @click="$emit('toggleFavorite', coin.id)">{{ favorites.includes(coin.id) ? '★' : '☆' }}</button></td>
        </tr>
        <tr v-if="coins.length === 0"><td class="empty-state" colspan="7">{{ filter === 'Watchlist' ? 'Your watchlist is empty. Star a token to keep it close.' : 'No tokens match that search.' }}</td></tr>
      </tbody>
    </table>
    <div v-if="loading && coins.length === 0" class="loading-state">Loading market data<span class="loading-dots"> ···</span></div>
  </div>
</template>
