<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  src?: string
  symbol: string
  address: string
  size?: number
}>(), {
  src: '',
  size: 28,
})

const imageFailed = ref(false)
watch(() => [props.src, props.address], () => {
  imageFailed.value = false
})

const hue = computed(() => {
  let hash = 0
  for (const character of props.address) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return hash % 360
})
const initials = computed(() => props.symbol.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?')
</script>

<template>
  <img
    v-if="src && !imageFailed"
    class="token-logo"
    :src="src"
    alt=""
    :title="`${symbol} token logo`"
    :style="{ width: `${size}px`, height: `${size}px` }"
    @error="imageFailed = true"
  />
  <span
    v-else
    class="token-logo token-logo-fallback"
    role="img"
    :aria-label="`${symbol} token logo placeholder`"
    :title="`${symbol} token logo placeholder`"
    :style="{ width: `${size}px`, height: `${size}px`, '--logo-hue': String(hue) }"
  >{{ initials }}</span>
</template>

<style scoped>
.token-logo {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 50%;
  object-fit: cover;
}

.token-logo-fallback {
  background: linear-gradient(145deg, hsl(var(--logo-hue), 62%, 48%), hsl(calc(var(--logo-hue) + 58), 66%, 22%));
  color: #fff;
  font: 800 9px Manrope, sans-serif;
  letter-spacing: -.3px;
}
</style>
