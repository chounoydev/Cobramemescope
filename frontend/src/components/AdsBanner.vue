<script setup lang="ts">
import { onMounted } from 'vue'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

const client = import.meta.env.VITE_ADSENSE_CLIENT || ''
const slot = import.meta.env.VITE_ADSENSE_SLOT || ''
const configured = client.startsWith('ca-pub-') && Boolean(slot)

function requestAd() {
  try {
    window.adsbygoogle = window.adsbygoogle || []
    window.adsbygoogle.push({})
  } catch {}
}

onMounted(() => {
  if (!configured) return
  let script = document.getElementById('memescope-adsense') as HTMLScriptElement | null
  if (!script) {
    script = document.createElement('script')
    script.id = 'memescope-adsense'
    script.async = true
    script.crossOrigin = 'anonymous'
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`
    script.addEventListener('load', requestAd, { once: true })
    document.head.append(script)
    return
  }
  requestAd()
})
</script>

<template>
  <section class="ad-banner" aria-label="Advertisement">
    <div class="ad-label">ADVERTISEMENT</div>
    <ins
      v-if="configured"
      class="adsbygoogle ad-slot"
      style="display:block"
      :data-ad-client="client"
      :data-ad-slot="slot"
      data-ad-format="auto"
      data-full-width-responsive="true"
    ></ins>
    <div v-else class="ad-setup">
      <div class="ad-stamp">MS / MEDIA</div>
      <div class="ad-copy"><strong>Reserved for your first campaign</strong><span>Publisher approval and an ad slot are required to serve paid ads.</span></div>
      <a href="https://adsense.google.com/start/" target="_blank" rel="noreferrer">Set up AdSense <span>↗</span></a>
    </div>
  </section>
</template>

<style scoped>
.ad-banner { position: relative; display: grid; min-height: 110px; grid-template-columns: 88px 1fr; align-items: stretch; overflow: hidden; margin: 22px 0 30px; border: 1px solid #c8cebe; background: #e8ebdf; }
.ad-label { display: grid; place-items: center; border-right: 1px solid #c8cebe; color: #777d6e; font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 1px; writing-mode: vertical-rl; transform: rotate(180deg); }
.ad-setup { display: flex; min-height: 108px; align-items: center; gap: 19px; padding: 17px 25px; background-image: linear-gradient(115deg, transparent 68%, rgb(255 255 255 / 28%) 68%, rgb(255 255 255 / 28%) 70%, transparent 70%); }
.ad-stamp { display: grid; width: 65px; height: 65px; flex: 0 0 auto; place-items: center; border: 1px solid #333a31; border-radius: 50%; color: #333a31; font-family: 'DM Mono', monospace; font-size: 9px; line-height: 1.5; text-align: center; }
.ad-copy { display: grid; gap: 5px; }.ad-copy strong { color: #2d352c; font-family: Manrope, sans-serif; font-size: 14px; }.ad-copy span { color: #747c6f; font-size: 10px; }
.ad-setup a { margin-left: auto; padding: 9px 13px; border: 1px solid #30372e; color: #30372e; font-size: 10px; font-weight: 700; white-space: nowrap; }.ad-setup a span { margin-left: 5px; }
.ad-slot { width: 100%; min-height: 90px; }
@media (max-width: 680px) { .ad-banner { grid-template-columns: 33px 1fr; margin: 18px 0 24px; }.ad-setup { flex-wrap: wrap; gap: 12px; padding: 14px; }.ad-stamp { width: 43px; height: 43px; font-size: 7px; }.ad-copy { flex: 1; min-width: 160px; }.ad-copy strong { font-size: 12px; }.ad-copy span { font-size: 9px; }.ad-setup a { margin-left: 55px; padding: 7px 9px; font-size: 9px; } }
</style>