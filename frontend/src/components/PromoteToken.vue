<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { createTokenPromotion, fetchPromotionOptions, uploadTokenPromotionImage, verifyTokenPromotionPayment } from '../lib/api'

const props = defineProps<{ token?: string }>()
const emit = defineEmits<{ openLogin: [] }>()

const options = ref({ receiver: '', baseDays: 21, basePriceSol: 0.5, periodDays: 21, maxDays: 365, currencies: ['SOL', 'USDC', 'USDT'] })
const form = ref({ name: '', symbol: '', mintAddress: '', imageUrl: '', websiteUrl: '', socialUrl: '', description: '', days: 21, currency: 'SOL' })
type TokenPromotion = {
  id: string
  [key: string]: unknown
}

const promotion = ref<TokenPromotion | null>(null)
const signature = ref('')
const loading = ref(false)
const error = ref('')
const notice = ref('')
const imageFile = ref<File | null>(null)
const imagePreview = ref('')
const listedSuccess = ref(false)

const periods = computed(() => Math.max(1, Math.ceil(form.value.days / options.value.periodDays)))
const solPrice = computed(() => Number((options.value.basePriceSol * periods.value).toFixed(2)))
const usdPrice = computed(() => solPrice.value.toFixed(2))

async function load() {
  try {
    options.value = await fetchPromotionOptions()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load promotion pricing.'
  }
}
load()

function openLogin() {
  emit('openLogin')
}

async function submit() {
  if (!props.token) return emit('openLogin')
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    if (imageFile.value && !imagePreview.value.startsWith('http')) {
      form.value.imageUrl = await uploadTokenPromotionImage(props.token, imageFile.value)
    }
    promotion.value = await createTokenPromotion(props.token, form.value)
    notice.value = 'Promotion saved. Send the exact listed payment and then verify the transaction.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not create the promotion.'
  } finally { loading.value = false }
}

async function selectImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    error.value = 'Choose a JPEG, PNG, WebP, or GIF photo.'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'The token photo must be 5 MB or smaller.'
    return
  }
  imageFile.value = file
  if (imagePreview.value.startsWith('blob:')) URL.revokeObjectURL(imagePreview.value)
  imagePreview.value = URL.createObjectURL(file)
}

async function verify() {
  if (!props.token || !promotion.value || !signature.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    await verifyTokenPromotionPayment(props.token, promotion.value.id, signature.value.trim())
    notice.value = 'Payment confirmed. Your token is now listed in the Market Tape.'
    listedSuccess.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Payment could not be verified yet.'
  } finally { loading.value = false }
}
</script>

<template>
  <section class="promotion-page">
    <header class="promotion-head">
      <div><div class="scan-eyebrow"><span></span> COBRA COMMUNITY <b>/</b> TOKEN PROMOTION</div><h1>Put your token <em>on the tape.</em></h1><p>Submit verified Solana token details and launch a paid promoted listing.</p></div>
      <div class="promotion-duration"><span>21-DAY STARTING PRICE</span><strong>{{ options.basePriceSol.toFixed(2) }} SOL</strong></div>
    </header>
    <div class="promotion-layout">
      <div class="promotion-preview" aria-label="Example of a promoted token listing">
        <div class="promotion-preview-label">MARKET TAPE PREVIEW</div>
        <div class="promotion-token-example">
          <img v-if="imagePreview" class="promotion-example-logo" :src="imagePreview" alt="Uploaded token logo" />
          <div v-else class="promotion-example-logo">{{ (form.symbol || 'CM').slice(0, 2) }}</div>
          <div><strong>{{ form.name || 'Cobra Moon' }} <span>✓ VERIFIED LISTING</span></strong><small>${{ form.symbol || 'CMOON' }} · {{ form.mintAddress ? `${form.mintAddress.slice(0, 6)}…${form.mintAddress.slice(-4)}` : 'Solana…example' }}</small></div>
          <div class="promotion-example-status"><strong>PROMOTED</strong><small>21 days remaining</small></div>
        </div>
      </div>
      <form class="promotion-form" @submit.prevent="submit">
        <div class="promotion-section-title"><span>TOKEN DETAILS</span><h2>Promotion submission</h2></div>
        <div class="promotion-grid">
          <label>Token name<input v-model="form.name" maxlength="80" required placeholder="Cobra Token" /></label>
          <label>Ticker<input v-model="form.symbol" maxlength="12" required placeholder="COBRA" /></label>
          <label class="promotion-wide">Solana mint address<input v-model="form.mintAddress" minlength="32" required placeholder="Token mint address" /></label>
          <label class="promotion-wide">Description<textarea v-model="form.description" maxlength="500" rows="4" required placeholder="Describe the token, purpose, and community." /></label>
          <label>Token photo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" @change="selectImage" /><small>Upload from your device or photo album · max 5 MB</small></label>
          <label>Website<input v-model="form.websiteUrl" type="url" placeholder="https://..." /></label>
          <label class="promotion-wide">Social / community link<input v-model="form.socialUrl" type="url" placeholder="https://x.com/..." /></label>
        </div>
        <div class="promotion-section-title"><span>LISTING PERIOD</span><h2>Choose your exposure</h2></div>
        <div class="promotion-grid">
          <label>Listing duration<select v-model.number="form.days"><option :value="21">21 days · 3 weeks</option><option :value="42">42 days · 6 weeks</option><option :value="63">63 days · 9 weeks</option><option :value="84">84 days · 12 weeks</option><option :value="365">365 days · 1 year</option></select></label>
          <label>Payment currency<select v-model="form.currency"><option v-for="currency in options.currencies" :key="currency">{{ currency }}</option></select></label>
        </div>
        <p class="promotion-warning">Promoted listings do not represent a security endorsement. Users should still review the contract and market risk.</p>
        <button class="promotion-submit" :type="token ? 'submit' : 'button'" :disabled="loading" @click="token ? undefined : openLogin">{{ promotion ? 'UPDATE / REOPEN SUBMISSION' : token ? `CONTINUE · ${form.currency === 'SOL' ? solPrice.toFixed(2) + ' SOL' : '$' + usdPrice + ' ' + form.currency}` : 'SIGN IN TO PROMOTE' }}</button>
      </form>
      <aside class="promotion-pay">
        <span>CHECKOUT</span><strong>{{ form.currency === 'SOL' ? solPrice.toFixed(2) + ' SOL' : '$' + usdPrice }}</strong><small>{{ solPrice.toFixed(2) }} SOL value · {{ form.days }} days</small>
        <div><span>PAYMENT NETWORK</span><b>Solana mainnet</b></div>
        <div><span>PAYMENT CURRENCY</span><b>{{ form.currency }}</b></div>
        <div><span>TREASURY</span><code>{{ options.receiver }}</code></div>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <label v-if="promotion">Transaction signature<input v-model="signature" required placeholder="Paste confirmed transaction signature" /></label>
        <button v-if="promotion" type="button" :disabled="loading || !signature.trim()" @click="verify">VERIFY PAYMENT &amp; LIST TOKEN</button>
      </aside>
    </div>
  </section>
  <div v-if="listedSuccess" class="promotion-success-backdrop" role="dialog" aria-modal="true" aria-labelledby="promotion-success-title">
    <div class="promotion-success">
      <div class="promotion-success-burst">✓</div>
      <span>PAYMENT VERIFIED</span>
      <h2 id="promotion-success-title">Congratulations!<br />Your token is now listed!</h2>
      <p>{{ form.name }} ({{ form.symbol }}) is live on the Cobra Market Tape with realtime chart and market tracking.</p>
      <button type="button" @click="listedSuccess = false">VIEW MY LISTING</button>
    </div>
  </div>
</template>

<style scoped>
.promotion-page { width:min(1180px,100%); display:grid; gap:24px; padding-bottom:64px; }
.promotion-head { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; }
.promotion-head h1 { margin:10px 0 8px; font-size:clamp(2rem,5vw,4rem); line-height:.95; }
.promotion-head h1 em { color:#89f0b1; font-style:normal; }
.promotion-head p { color:#91a0a4; }
.promotion-duration { min-width:190px; padding:18px; border:1px solid #89f0b133; border-radius:12px; background:#89f0b10b; }
.promotion-duration span,.promotion-section-title span,.promotion-pay>span { color:#78d99d; font:700 .68rem monospace; letter-spacing:.12em; }
.promotion-duration strong { display:block; margin-top:6px; font-size:1.5rem; }
.promotion-layout { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:18px; align-items:start; }
.promotion-preview { grid-column:1/-1; border:1px solid #89f0b133; border-radius:14px; padding:18px; background:linear-gradient(105deg,#071213,#10251f); }
.promotion-preview-label { margin-bottom:12px; color:#78d99d; font:700 .65rem monospace; letter-spacing:.12em; }
.promotion-token-example { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; min-height:66px; }
.promotion-example-logo { display:grid; width:48px; height:48px; place-items:center; border-radius:50%; background:linear-gradient(135deg,#8ff0b1,#1d7554); color:#092019; font-weight:900; box-shadow:0 0 24px #8ff0b155; }
img.promotion-example-logo { object-fit:cover; border:0; }
.promotion-token-example strong { display:flex; align-items:center; gap:7px; color:#eef7f4; }.promotion-token-example strong span { border-radius:999px; background:#dff8e8; color:#177c45; font-size:.58rem; padding:4px 7px; }
.promotion-token-example small { display:block; margin-top:5px; color:#91a0a4; }.promotion-example-status { text-align:right; }.promotion-example-status strong { justify-content:flex-end; color:#89f0b1; font-size:.68rem; }
.promotion-form,.promotion-pay { border:1px solid #aec3c724; border-radius:16px; background:#071213ed; }
.promotion-form { padding:28px; }
.promotion-section-title h2 { margin:7px 0 18px; font-size:1.3rem; }
.promotion-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.promotion-grid label,.promotion-pay label { display:grid; gap:7px; color:#91a0a4; font-size:.72rem; font-weight:700; letter-spacing:.04em; }
.promotion-grid label small { color:#829089; font-size:.68rem; font-weight:400; }
.promotion-grid input[type='file'] { padding:8px; }
.promotion-wide { grid-column:1/-1; }
.promotion-form input,.promotion-form textarea,.promotion-form select,.promotion-pay input { width:100%; box-sizing:border-box; border:1px solid #aec3c724; border-radius:8px; background:#091719; color:#eff7f6; padding:12px; }
.promotion-warning { border-left:3px solid #89f0b1; padding:10px 14px; color:#91a0a4; background:#89f0b108; }
.promotion-submit,.promotion-pay button { width:100%; min-height:46px; border:0; border-radius:8px; background:#89f0b1; color:#092019; font-weight:800; cursor:pointer; }
.promotion-pay { position:sticky; top:90px; display:grid; gap:16px; padding:24px; }
.promotion-pay>strong { font-size:2rem; }
.promotion-pay>small { color:#91a0a4; }
.promotion-success-backdrop { position:fixed; inset:0; z-index:100; display:grid; place-items:center; padding:20px; background:#020707d9; backdrop-filter:blur(8px); }
.promotion-success { width:min(520px,100%); text-align:center; border:1px solid #89f0b17a; border-radius:18px; padding:34px; background:linear-gradient(145deg,#10241f,#07120f); box-shadow:0 24px 90px #000; animation:promotion-pop .28s ease-out; }
.promotion-success-burst { display:grid; width:76px; height:76px; margin:0 auto 18px; place-items:center; border-radius:50%; background:#89f0b1; color:#092019; font-size:2rem; font-weight:900; box-shadow:0 0 42px #89f0b155; }
.promotion-success>span { color:#89f0b1; font:700 .68rem monospace; letter-spacing:.16em; }
.promotion-success h2 { margin:12px 0; font-size:clamp(1.7rem,5vw,2.5rem); line-height:1.05; }
.promotion-success p { color:#aab6b1; line-height:1.6; }
.promotion-success button { margin-top:18px; min-height:44px; border:0; border-radius:8px; padding:0 22px; background:#89f0b1; color:#092019; font-weight:800; cursor:pointer; }
@keyframes promotion-pop { from { opacity:0; transform:translateY(18px) scale(.96); } to { opacity:1; transform:none; } }
.promotion-pay>div { display:grid; gap:5px; padding-top:12px; border-top:1px solid #aec3c71c; }
.promotion-pay div span { color:#819096; font-size:.62rem; }
.promotion-pay code { overflow-wrap:anywhere; color:#dff9e8; font-size:.72rem; }
.promotion-pay p { color:#ffc3c3; }
.scan-eyebrow { color:#8a999d; font:700 .66rem monospace; letter-spacing:.09em; }.scan-eyebrow span { display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:#8ff0b1 }
@media(max-width:900px){.promotion-layout{grid-template-columns:1fr}.promotion-pay{position:static}.promotion-head{align-items:flex-start;flex-direction:column}}
@media(max-width:600px){
  .promotion-page{padding-bottom:96px}
  .promotion-head{width:100%}
  .promotion-head h1{font-size:2.35rem;overflow-wrap:anywhere}
  .promotion-duration{width:100%;box-sizing:border-box;min-width:0}
  .promotion-preview{overflow:hidden}
  .promotion-token-example{grid-template-columns:46px minmax(0,1fr)}
  .promotion-example-status{grid-column:2}
  .promotion-grid{grid-template-columns:minmax(0,1fr)}
  .promotion-wide{grid-column:auto}
  .promotion-form{min-width:0;padding:18px}
  .promotion-form input,.promotion-form textarea,.promotion-form select{width:100%;box-sizing:border-box}
  .promotion-submit{width:100%;min-height:48px}
  .promotion-success{width:min(420px,calc(100% - 28px));padding:28px 20px}
}
</style>
