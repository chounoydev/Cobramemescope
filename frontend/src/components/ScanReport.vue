<script setup lang="ts">
import { computed } from 'vue'
import type { ContractScan, ScanCheck } from '../lib/api'
import { formatCurrency } from '../lib/currency'

const props = defineProps<{ report: ContractScan }>()

const orderedChecks = computed(() => {
  const priority: Record<ScanCheck['status'], number> = { danger: 0, caution: 1, unknown: 2, clear: 3 }
  return [...props.report.checks].sort((left, right) => priority[left.status] - priority[right.status])
})

const verdict = computed(() => {
  if (props.report.summary.flaggedCount > 0) return 'NOT SAFE · HIGH RISK'
  if (props.report.summary.cautionCount > 0) {
    const cautions = props.report.checks.filter((check) => check.status === 'caution')
    const holderRisk = cautions.some((check) => ['holder-concentration', 'developer-hold'].includes(check.id))
    const liquidityRisk = cautions.some((check) => ['liquidity', 'lp-lock'].includes(check.id))
    if (holderRisk && liquidityRisk) return 'CAUTION · HOLDERS + LIQUIDITY'
    if (holderRisk) return 'CAUTION · HOLDER CONCENTRATION'
    if (liquidityRisk) return 'CAUTION · LOW LIQUIDITY'
    return 'CAUTION · REVIEW SIGNALS'
  }
  if (props.report.summary.unknownCount > 0 || !props.report.security.available || !props.report.sources.market || props.report.sources.market === 'unavailable') return 'UNVERIFIED'
  return 'SAFE · NO FLAGS FOUND'
})

const verdictClass = computed(() => {
  if (props.report.summary.flaggedCount > 0) return 'is-danger'
  if (props.report.summary.cautionCount > 0) return 'is-caution'
  return verdict.value === 'UNVERIFIED' ? 'is-limited' : 'is-clear'
})

const verdictIcon = computed(() => verdictClass.value === 'is-danger' ? '×' : verdictClass.value === 'is-caution' ? '△' : verdictClass.value === 'is-clear' ? '✓' : '?')

function formatUsd(value: number | null) {
  if (value === null) return '—'
  return formatCurrency(value)
}

function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-5)}` : value
}
</script>

<template>
  <section class="report-shell" aria-labelledby="report-title">
    <div class="report-header">
      <div class="report-token">
        <div class="token-monogram">{{ report.token.symbol === '—' ? '?' : report.token.symbol.slice(0, 1) }}</div>
        <div>
          <div class="report-overline">CONTRACT REPORT <span>{{ report.chain }}</span></div>
          <h2 id="report-title">{{ report.token.name }} <small>{{ report.token.symbol }}</small></h2>
          <code>{{ report.address }}</code>
        </div>
      </div>
      <div class="verdict-chip" :class="verdictClass"><span class="verdict-icon" aria-hidden="true">{{ verdictIcon }}</span>{{ verdict }}</div>
    </div>

    <div class="report-counts" aria-label="Scan summary">
      <div class="count-danger"><strong>{{ report.summary.flaggedCount }}</strong><span>RED FLAGS</span></div>
      <div class="count-caution"><strong>{{ report.summary.cautionCount }}</strong><span>CAUTIONS</span></div>
      <div class="count-unknown"><strong>{{ report.summary.unknownCount }}</strong><span>UNKNOWN</span></div>
      <p v-if="verdictClass === 'is-clear'">Safe means no covered checks found a flag. No scan can guarantee zero risk.</p>
      <p v-else-if="verdictClass === 'is-danger'">High-risk findings were reported. Do not treat this token as safe.</p>
      <p v-else-if="verdictClass === 'is-caution'">Cautions need review, but are not confirmed red flags.</p>
      <p v-else>Unknown means the source did not return enough data. It is not a clean result.</p>
    </div>

    <div class="market-metrics">
      <div><span>POOL LIQUIDITY</span><strong>{{ formatUsd(report.market?.liquidityUsd ?? null) }}</strong></div>
      <div><span>FDV</span><strong>{{ formatUsd(report.market?.fdv ?? null) }}</strong></div>
      <div><span>24H VOLUME</span><strong>{{ formatUsd(report.market?.volume24h ?? null) }}</strong></div>
      <div><span>BUYS / SELLS</span><strong>{{ report.market?.buys24h ?? '—' }} / {{ report.market?.sells24h ?? '—' }}</strong></div>
    </div>

    <div class="report-columns">
      <section class="signal-section" aria-labelledby="signal-title">
        <div class="report-section-head">
          <div><span>01 / EVIDENCE</span><h3 id="signal-title">Signals to review</h3></div>
          <span>{{ report.checks.length }} checks</span>
        </div>
        <ul class="signal-list">
          <li v-for="check in orderedChecks" :key="check.id" class="signal-row" :class="`signal-${check.status}`">
            <span class="signal-mark" aria-hidden="true">{{ check.status === 'danger' ? '!' : check.status === 'caution' ? '△' : check.status === 'clear' ? '✓' : '?' }}</span>
            <div class="signal-copy"><div><strong>{{ check.label }}</strong><b v-if="check.value">{{ check.value }}</b></div><p>{{ check.detail }}</p><small>{{ check.source }}</small></div>
            <span class="signal-status">{{ check.status === 'danger' ? 'FLAG' : check.status === 'caution' ? 'CAUTION' : check.status === 'clear' ? 'CLEAR' : 'UNKNOWN' }}</span>
          </li>
        </ul>
      </section>

      <aside class="evidence-sidebar">
        <section v-if="report.security.holders.length" class="holder-section" aria-labelledby="holder-title">
          <div class="report-section-head">
            <div><span>02 / DISTRIBUTION</span><h3 id="holder-title">Largest holders</h3></div>
            <span>{{ report.security.source }}</span>
          </div>
          <div v-for="(holder, index) in report.security.holders.slice(0, 6)" :key="holder.address || index" class="holder-row">
            <span class="holder-rank">{{ String(index + 1).padStart(2, '0') }}</span>
            <div><code>{{ shortAddress(holder.address || 'Unknown') }}</code><small>{{ holder.tag || (holder.insider ? 'Flagged insider' : 'Holder') }}</small></div>
            <strong>{{ holder.percent === null ? '—' : `${holder.percent.toFixed(2)}%` }}</strong>
          </div>
        </section>
        <section class="source-section">
          <div class="report-section-head"><div><span>03 / COVERAGE</span><h3>Data sources</h3></div></div>
          <div class="source-row"><span>DexScreener</span><strong :class="`source-${report.sources.market}`">{{ report.sources.market }}</strong></div>
          <div class="source-row"><span>{{ report.security.source }}</span><strong :class="`source-${report.sources.security}`">{{ report.sources.security }}</strong></div>
          <div v-if="report.security.score !== null" class="source-row"><span>Provider risk score</span><strong>{{ report.security.score }}</strong></div>
          <p>Checks are snapshots from third-party data. Contract behavior and liquidity can change after this scan.</p>
        </section>
      </aside>
    </div>

    <footer class="report-footer">
      <span>Scanned {{ new Date(report.checkedAt).toLocaleString() }}</span>
      <a v-if="report.market?.url" :href="report.market.url" target="_blank" rel="noreferrer">Open {{ report.market.dex }} pair ↗</a>
      <span>Risk indicators only. Not investment advice.</span>
    </footer>
  </section>
</template>

<style scoped>
.report-shell { border: 1px solid #d9ddd4; background: #fff; }
.report-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 23px 25px; border-bottom: 1px solid #e8eae4; }
.report-token { display: flex; min-width: 0; align-items: center; gap: 14px; }.token-monogram { display: grid; width: 49px; height: 49px; flex: 0 0 auto; place-items: center; background: #e0f36a; color: #1d241d; font-family: Manrope, sans-serif; font-size: 20px; font-weight: 800; }
.report-overline { color: #858b7f; font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 1px; }.report-overline span { margin-left: 8px; color: #5c7054; }.report-token h2 { overflow: hidden; margin-top: 4px; color: #171c17; font-family: Manrope, sans-serif; font-size: 21px; text-overflow: ellipsis; white-space: nowrap; }.report-token h2 small { margin-left: 5px; color: #81877d; font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 400; }.report-token code { display: block; overflow: hidden; max-width: min(60vw, 500px); margin-top: 5px; color: #92978e; font-size: 9px; text-overflow: ellipsis; }
.verdict-chip { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; padding: 8px 11px; font-size: 10px; font-weight: 700; }.verdict-icon { display: grid; width: 19px; height: 19px; flex: 0 0 auto; place-items: center; border: 1px solid currentColor; border-radius: 50%; font-size: 15px; font-weight: 800; line-height: 1; }.is-danger { background: #fae8e5; color: #b4372d; }.is-danger .verdict-icon { border-color: #b4372d; background: #b4372d; color: #fff; }.is-caution { background: #fbf0d9; color: #9b6a18; }.is-limited { background: #eceee8; color: #666e61; }.is-limited .verdict-icon { font-size: 11px; }.is-clear { background: #e7f1df; color: #466637; }.is-clear .verdict-icon { border-color: #466637; background: #466637; color: #fff; }
.report-counts { display: flex; align-items: center; gap: 0; padding: 14px 25px; border-bottom: 1px solid #e8eae4; background: #f8f9f5; }.report-counts > div { display: grid; min-width: 93px; gap: 2px; }.report-counts strong { font-family: Manrope, sans-serif; font-size: 20px; line-height: 1; }.report-counts span { color: #7e847b; font-family: 'DM Mono', monospace; font-size: 7px; letter-spacing: .6px; }.count-danger strong { color: #b43a31; }.count-caution strong { color: #aa741d; }.count-unknown strong { color: #737a70; }.report-counts p { margin-left: auto; color: #848b80; font-size: 9px; }
.market-metrics { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid #e8eae4; }.market-metrics > div { display: grid; min-width: 0; gap: 7px; padding: 16px 20px; border-right: 1px solid #e8eae4; }.market-metrics > div:last-child { border-right: 0; }.market-metrics span { color: #858b81; font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: .5px; }.market-metrics strong { overflow: hidden; color: #20261f; font-family: Manrope, sans-serif; font-size: 16px; text-overflow: ellipsis; }
.report-columns { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(250px, .8fr); }.signal-section { min-width: 0; border-right: 1px solid #e8eae4; }.report-section-head { display: flex; min-height: 68px; align-items: center; justify-content: space-between; gap: 10px; padding: 13px 20px; border-bottom: 1px solid #e8eae4; }.report-section-head > div > span { color: #8c9388; font-family: 'DM Mono', monospace; font-size: 7px; letter-spacing: .7px; }.report-section-head h3 { margin-top: 4px; color: #2b3129; font-family: Manrope, sans-serif; font-size: 13px; }.report-section-head > span { color: #969c91; font-family: 'DM Mono', monospace; font-size: 8px; }
.signal-list { padding: 0; list-style: none; }.signal-row { display: grid; grid-template-columns: 23px minmax(0, 1fr) auto; gap: 10px; padding: 12px 18px; border-bottom: 1px solid #eff0ec; }.signal-row:last-child { border-bottom: 0; }.signal-mark { display: grid; width: 20px; height: 20px; place-items: center; border: 1px solid currentColor; font-size: 10px; font-weight: 700; }.signal-danger { color: #ac352c; }.signal-caution { color: #9b6a18; }.signal-clear { color: #537346; }.signal-unknown { color: #747b71; }.signal-copy { min-width: 0; }.signal-copy > div { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }.signal-copy strong { color: #323830; font-size: 10px; font-weight: 700; }.signal-copy b { color: #323830; font-family: 'DM Mono', monospace; font-size: 9px; }.signal-copy p { margin-top: 4px; color: #747b72; font-size: 9px; line-height: 1.5; }.signal-copy small { display: block; margin-top: 5px; color: #a1a69e; font-family: 'DM Mono', monospace; font-size: 7px; }.signal-status { padding-top: 2px; color: #888e84; font-family: 'DM Mono', monospace; font-size: 7px; }
.evidence-sidebar { min-width: 0; }.holder-section { border-bottom: 1px solid #e8eae4; }.holder-row { display: grid; grid-template-columns: 23px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 9px 17px; border-bottom: 1px solid #eff0ec; }.holder-row:last-child { border-bottom: 0; }.holder-rank { color: #a1a69d; font-family: 'DM Mono', monospace; font-size: 8px; }.holder-row code { color: #50574e; font-family: 'DM Mono', monospace; font-size: 8px; }.holder-row small { display: block; margin-top: 3px; color: #92988e; font-size: 8px; }.holder-row strong { color: #353b32; font-family: 'DM Mono', monospace; font-size: 9px; }.source-section .report-section-head { min-height: 58px; }.source-row { display: flex; justify-content: space-between; gap: 8px; padding: 9px 17px; border-bottom: 1px solid #eff0ec; color: #656d62; font-size: 9px; }.source-row strong { font-family: 'DM Mono', monospace; font-size: 8px; font-weight: 500; text-transform: uppercase; }.source-available { color: #557542; }.source-unavailable { color: #9b6a18; }.source-section > p { padding: 13px 17px; color: #8c9388; font-size: 8px; line-height: 1.6; }
.report-footer { display: flex; justify-content: space-between; gap: 12px; padding: 11px 18px; border-top: 1px solid #e8eae4; color: #91978e; font-size: 8px; }.report-footer a { color: #455e3a; font-weight: 700; }
@media (max-width: 760px) { .report-header { align-items: flex-start; padding: 16px 13px; }.report-token { gap: 9px; }.token-monogram { width: 39px; height: 39px; font-size: 16px; }.report-token h2 { font-size: 16px; }.verdict-chip { max-width: 130px; padding: 7px; font-size: 8px; }.report-counts { flex-wrap: wrap; gap: 12px; padding: 12px; }.report-counts > div { min-width: 60px; }.report-counts p { width: 100%; margin: 0; }.market-metrics { grid-template-columns: repeat(2, 1fr); }.market-metrics > div { padding: 12px; border-bottom: 1px solid #e8eae4; }.market-metrics > div:nth-child(2) { border-right: 0; }.report-columns { grid-template-columns: 1fr; }.signal-section { border-right: 0; border-bottom: 1px solid #e8eae4; }.signal-row { padding: 11px 12px; }.report-footer { flex-wrap: wrap; padding: 10px 12px; }.report-footer span:last-child { width: 100%; } }

:global(.dark-mode) .report-shell {
  border-color: #23505a;
  border-radius: 10px;
  background: #071a20;
  color: #e8f3f5;
  box-shadow: 0 18px 50px rgb(0 0 0 / 22%);
}

:global(.dark-mode) .report-shell .report-header,
:global(.dark-mode) .report-shell .report-counts,
:global(.dark-mode) .report-shell .market-metrics,
:global(.dark-mode) .report-shell .market-metrics > div,
:global(.dark-mode) .report-shell .report-section-head,
:global(.dark-mode) .report-shell .signal-section,
:global(.dark-mode) .report-shell .holder-section,
:global(.dark-mode) .report-shell .signal-row,
:global(.dark-mode) .report-shell .holder-row,
:global(.dark-mode) .report-shell .source-row,
:global(.dark-mode) .report-shell .report-footer {
  border-color: #1c3b44;
}

:global(.dark-mode) .report-shell .report-header {
  background: linear-gradient(110deg, #0d252b, #091b21);
}

:global(.dark-mode) .report-shell .report-counts {
  background: #0b2026;
}

:global(.dark-mode) .report-shell .market-metrics > div {
  background: #091d23;
}

:global(.dark-mode) .report-shell .report-section-head {
  background: #0b2026;
}

:global(.dark-mode) .report-shell .signal-row,
:global(.dark-mode) .report-shell .holder-row,
:global(.dark-mode) .report-shell .source-row {
  background: #081b21;
}

:global(.dark-mode) .report-shell .report-token h2,
:global(.dark-mode) .report-shell .signal-copy strong,
:global(.dark-mode) .report-shell .signal-copy b,
:global(.dark-mode) .report-shell .holder-row strong,
:global(.dark-mode) .report-shell .report-section-head h3,
:global(.dark-mode) .report-shell .market-metrics strong {
  color: #f0f8fa;
}

:global(.dark-mode) .report-shell .report-overline,
:global(.dark-mode) .report-shell .report-overline span,
:global(.dark-mode) .report-shell .report-token h2 small,
:global(.dark-mode) .report-shell .report-token code,
:global(.dark-mode) .report-shell .report-counts span,
:global(.dark-mode) .report-shell .report-counts p,
:global(.dark-mode) .report-shell .market-metrics span,
:global(.dark-mode) .report-shell .report-section-head > div > span,
:global(.dark-mode) .report-shell .report-section-head > span,
:global(.dark-mode) .report-shell .signal-copy p,
:global(.dark-mode) .report-shell .signal-copy small,
:global(.dark-mode) .report-shell .signal-status,
:global(.dark-mode) .report-shell .holder-rank,
:global(.dark-mode) .report-shell .holder-row code,
:global(.dark-mode) .report-shell .holder-row small,
:global(.dark-mode) .report-shell .source-row,
:global(.dark-mode) .report-shell .source-section > p,
:global(.dark-mode) .report-shell .report-footer {
  color: #b1c5ca;
}

:global(.dark-mode) .report-shell .token-monogram {
  background: #91f276;
  color: #102018;
}

:global(.dark-mode) .report-shell .count-danger strong {
  color: #ff888d;
}

:global(.dark-mode) .report-shell .count-caution strong {
  color: #ffd078;
}

:global(.dark-mode) .report-shell .count-unknown strong {
  color: #c0d0d4;
}

:global(.dark-mode) .report-shell .verdict-chip.is-danger {
  background: #472329;
  color: #ff9da0;
}

:global(.dark-mode) .report-shell .verdict-chip.is-caution {
  background: #3d321a;
  color: #ffd078;
}

:global(.dark-mode) .report-shell .verdict-chip.is-limited {
  background: #23343a;
  color: #c4d3d7;
}

:global(.dark-mode) .report-shell .verdict-chip.is-clear {
  background: #1d3829;
  color: #9ae7a1;
}

:global(.dark-mode) .report-shell .signal-danger .signal-mark,
:global(.dark-mode) .report-shell .signal-danger .signal-status,
:global(.dark-mode) .report-shell .source-unavailable {
  color: #ff9698;
}

:global(.dark-mode) .report-shell .signal-caution .signal-mark,
:global(.dark-mode) .report-shell .signal-caution .signal-status,
:global(.dark-mode) .report-shell .source-degraded {
  color: #ffd078;
}

:global(.dark-mode) .report-shell .signal-clear .signal-mark,
:global(.dark-mode) .report-shell .signal-clear .signal-status,
:global(.dark-mode) .report-shell .source-available {
  color: #91e5a0;
}

:global(.dark-mode) .report-shell .report-footer a {
  color: #91f276;
}

.report-shell .report-overline,
.report-shell .report-counts span,
.report-shell .market-metrics span,
.report-shell .report-section-head > div > span,
.report-shell .report-section-head > span,
.report-shell .signal-copy small,
.report-shell .signal-status,
.report-shell .holder-rank,
.report-shell .holder-row code,
.report-shell .holder-row small,
.report-shell .source-row strong,
.report-shell .source-section > p,
.report-shell .report-footer {
  font-size: 12px;
}

.report-shell .report-token h2 {
  font-size: 25px;
}

.report-shell .report-token h2 small {
  font-size: 14px;
}

.report-shell .report-token code,
.report-shell .verdict-chip,
.report-shell .report-counts p,
.report-shell .source-row {
  font-size: 13px;
}

.report-shell .report-counts span,
.report-shell .market-metrics span,
.report-shell .report-section-head > div > span,
.report-shell .report-section-head > span,
.report-shell .signal-copy small,
.report-shell .signal-status,
.report-shell .holder-rank,
.report-shell .holder-row code,
.report-shell .holder-row small,
.report-shell .source-row strong,
.report-shell .report-footer {
  font-size: 11px;
}

.report-shell .market-metrics strong {
  font-size: 20px;
}

.report-shell .report-section-head h3 {
  font-size: 17px;
}

.report-shell .signal-row {
  grid-template-columns: 27px minmax(0, 1fr) auto;
  gap: 12px;
  padding: 15px 20px;
}

.report-shell .signal-mark {
  width: 24px;
  height: 24px;
  font-size: 13px;
}

.report-shell .signal-copy strong,
.report-shell .holder-row strong {
  font-size: 14px;
}

.report-shell .signal-copy b {
  font-size: 12px;
}

.report-shell .signal-copy p,
.report-shell .source-section > p {
  font-size: 13px;
  line-height: 1.65;
}

.report-shell .holder-row {
  padding: 12px 17px;
}

.report-shell .source-row {
  padding: 11px 17px;
}

@media (max-width: 760px) {
  .report-shell .report-token h2 {
    font-size: 20px;
  }

  .report-shell .verdict-chip {
    max-width: 155px;
    font-size: 11px;
  }

  .report-shell .signal-row {
    padding: 13px 12px;
  }

  .report-shell .signal-copy p,
  .report-shell .source-section > p {
    font-size: 12px;
  }
}
</style>