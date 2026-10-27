<script setup lang="ts">
import type { DonorDashboard } from '../lib/api'

defineProps<{
  dashboard: DonorDashboard | null
  loading: boolean
  error: string
}>()

const emit = defineEmits<{ refresh: [] }>()

function compactAddress(address: string) {
  return `${address.slice(0, 5)}…${address.slice(-5)}`
}

function formatSol(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isActive(value: string) {
  return Date.now() - new Date(value).getTime() < 7 * 24 * 60 * 60 * 1000
}
</script>

<template>
  <section class="owner-dashboard" aria-labelledby="owner-dashboard-title">
    <div class="owner-dashboard-head">
      <div>
        <div class="owner-eyebrow"><span></span> PRIVATE OWNER CONSOLE <b>/</b> SOLANA</div>
        <h1 id="owner-dashboard-title">Donor activity<em>.</em></h1>
        <p>Inbound SOL transfers to the developer wallet. Dashboard access is wallet-restricted.</p>
      </div>
      <div class="owner-head-actions">
        <span class="owner-locked">◇ OWNER WALLET</span>
        <button type="button" :disabled="loading" aria-label="Refresh donor activity" @click="emit('refresh')">↻</button>
      </div>
    </div>

    <div v-if="loading && !dashboard" class="owner-loading" role="status"><span class="scan-spinner"></span><div><strong>Reading recent wallet activity</strong><small>Reviewing confirmed transactions on Solana</small></div></div>
    <div v-else-if="error" class="owner-error" role="alert"><strong>Could not load donor activity</strong><span>{{ error }}</span><button type="button" @click="emit('refresh')">RETRY ↻</button></div>
    <template v-else-if="dashboard">
      <div class="owner-metrics">
        <article><span>INBOUND SOL · {{ dashboard.windowDays }}D</span><strong>{{ formatSol(dashboard.totalSol) }} <small>SOL</small></strong><i>Confirmed transfers to owner wallet</i></article>
          <article><span>ACTIVE DONORS · {{ dashboard.windowDays }}D</span><strong>{{ dashboard.activeDonors }}</strong><i>Unique sender wallets observed</i></article>
        <article><span>INBOUND TRANSFERS</span><strong>{{ dashboard.decodedTransfers }}</strong><i>Matched in the scanned window</i></article>
        <article><span>WALLET ACTIVITY SCANNED</span><strong>{{ dashboard.scannedTransactions }}</strong><i>Most recent confirmed transactions</i></article>
      </div>

      <section class="owner-login-section" aria-labelledby="login-stats-title">
        <div class="owner-login-heading">
          <h2 id="login-stats-title">People using Cobra MemeScope</h2>
          <span>Unique wallet addresses or registered accounts</span>
        </div>
        <div v-if="dashboard.loginStats">
          <div class="owner-active-users" aria-label="Unique account sign-ins in the last 24 hours">
            <div class="owner-active-users-head">
              <span class="owner-active-indicator"></span>
              <div><strong>Active users · 24h</strong><small>Unique accounts with a successful login in the past 24 hours</small></div>
              <b>{{ dashboard.loginStats.activeUsers24h }}</b>
            </div>
            <div class="owner-auth-methods">
              <article><span class="owner-auth-icon email-auth-icon" aria-hidden="true">@</span><div><small>EMAIL LOGINS</small><strong>{{ dashboard.loginStats.emailUsers24h }}</strong></div></article>
              <article><span class="owner-auth-icon wallet-auth-icon" aria-hidden="true">◇</span><div><small>WALLET LOGINS</small><strong>{{ dashboard.loginStats.walletUsers24h }}</strong></div></article>
            </div>
          </div>
          <div class="owner-login-grid">
            <article><span>USERS TODAY</span><strong>{{ dashboard.loginStats.today }}</strong><i>Unique users since midnight</i></article>
            <article><span>USERS THIS YEAR</span><strong>{{ dashboard.loginStats.thisYear }}</strong><i>Unique users since January 1</i></article>
            <article><span>USERS ALL TIME</span><strong>{{ dashboard.loginStats.allTime }}</strong><i>Unique users recorded</i></article>
          </div>
          <div class="owner-activity-summary" aria-label="Platform activity today">
            <div><span>WALLET CONNECTIONS</span><strong>{{ dashboard.loginStats.walletConnectionsToday }}</strong></div>
            <div><span>CONTRACT SCANS</span><strong>{{ dashboard.loginStats.contractScansToday }}</strong></div>
            <div><span>TOKENS TRACKED</span><strong>{{ dashboard.loginStats.tokensTrackedToday }}</strong></div>
          </div>
        </div>
        <div v-else class="owner-analytics-warning" role="status"><strong>Usage analytics unavailable</strong><span>{{ dashboard.analyticsError || 'Check the backend database connection.' }}</span></div>
      </section>

      <div class="owner-data-grid">
        <section class="owner-data-panel" aria-labelledby="leaderboard-title">
          <div class="owner-panel-head"><div><span>01 / LEADERBOARD</span><h2 id="leaderboard-title">Top donors</h2></div><small>LAST {{ dashboard.windowDays }} DAYS</small></div>
          <div v-if="dashboard.topDonors.length" class="donor-table-wrap">
            <table class="donor-table">
              <thead><tr><th>#</th><th>DONOR WALLET</th><th>STATUS</th><th>TOTAL SOL</th><th>TRANSFERS</th></tr></thead>
              <tbody><tr v-for="donor in dashboard.topDonors" :key="donor.address">
                <td class="donor-rank">{{ String(donor.rank).padStart(2, '0') }}</td>
                <td><a :href="`https://solscan.io/account/${donor.address}`" target="_blank" rel="noreferrer">{{ compactAddress(donor.address) }} ↗</a></td>
                <td><span class="donor-active" :class="{ inactive: !isActive(donor.lastSeen) }"><i></i>{{ isActive(donor.lastSeen) ? 'ACTIVE' : 'PAST' }}</span></td>
                <td class="donor-amount">{{ formatSol(donor.totalSol) }} SOL</td>
                <td class="donor-transfer-count">{{ donor.transferCount }}</td>
              </tr></tbody>
            </table>
          </div>
          <div v-else class="owner-empty">No inbound SOL transfers were found in the scanned transactions.</div>
        </section>

        <section class="owner-data-panel recent-panel" aria-labelledby="recent-transfers-title">
          <div class="owner-panel-head"><div><span>02 / ACTIVITY</span><h2 id="recent-transfers-title">Recent transfers</h2></div><small>{{ dashboard.recentTransfers.length }} EVENTS</small></div>
          <div v-if="dashboard.recentTransfers.length" class="recent-list">
            <article v-for="transfer in dashboard.recentTransfers" :key="transfer.signature">
              <span class="transfer-mark">↓</span>
              <div class="transfer-copy"><strong>{{ compactAddress(transfer.donor) }}</strong><small>{{ formatDate(transfer.timestamp) }}</small></div>
              <strong class="transfer-amount">+{{ formatSol(transfer.sol) }} SOL</strong>
              <a :href="`https://solscan.io/tx/${transfer.signature}`" target="_blank" rel="noreferrer" :aria-label="`Open transaction ${transfer.signature} on Solscan`">↗</a>
            </article>
          </div>
          <div v-else class="owner-empty">No recent inbound transfers.</div>
        </section>
      </div>

      <div class="owner-data-note"><strong>DATA LIMITS</strong><span>This view scans up to {{ dashboard.scannedTransactions }} recent wallet transactions and counts inbound SOL only. It cannot tell whether a transfer was intended as a donation; SPL-token transfers and older activity may be missing.</span><span>UPDATED {{ formatDate(dashboard.updatedAt) }}</span></div>
    </template>
  </section>
</template>

<style scoped>
.owner-active-users { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, .75fr); align-items: center; gap: 18px; margin-bottom: 12px; padding: 13px 15px; border: 1px solid #dce0d7; background: linear-gradient(110deg, #fff 0%, #fbfcf8 65%, #f5f8ee 100%); }
.owner-active-users-head { display: flex; min-width: 0; align-items: center; gap: 10px; }
.owner-active-users-head > div { display: grid; min-width: 0; gap: 4px; }
.owner-active-users-head > div > strong { color: #293126; font: 800 12px Manrope, sans-serif; }
.owner-active-users-head > div > small { color: #81897d; font-size: 9px; line-height: 1.4; }
.owner-active-users-head > b { margin-left: auto; color: #283523; font: 800 25px Manrope, sans-serif; font-variant-numeric: tabular-nums; }
.owner-active-indicator { width: 9px; height: 9px; flex: 0 0 9px; border-radius: 50%; background: #69a84b; box-shadow: 0 0 0 4px #e6f1dc, 0 0 12px #9dcc7a; }
.owner-auth-methods { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.owner-auth-methods article { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 8px 9px; border: 1px solid #e4e8df; border-radius: 7px; background: #fff; }
.owner-auth-methods article > div { display: grid; min-width: 0; gap: 3px; }
.owner-auth-methods article > div > small { color: #81897d; font: 7px 'DM Mono', monospace; }
.owner-auth-methods article > div > strong { color: #2c3528; font: 800 15px Manrope, sans-serif; font-variant-numeric: tabular-nums; }
.owner-auth-icon { display: grid; width: 27px; height: 27px; flex: 0 0 27px; place-items: center; border-radius: 7px; font-size: 13px; font-weight: 800; }
.email-auth-icon { background: #f0edff; color: #6b58a6; }
.wallet-auth-icon { background: #fff3dc; color: #a26d1b; }
.owner-dashboard { max-width: 1160px; margin: 0 auto; padding: 37px 0 20px; }.owner-dashboard-head { display: flex; align-items: end; justify-content: space-between; gap: 18px; padding-bottom: 22px; }.owner-eyebrow { display: flex; align-items: center; gap: 8px; color: #737c6f; font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: .9px; }.owner-eyebrow > span { width: 8px; height: 8px; border-radius: 50%; background: #daee70; box-shadow: 0 0 0 3px #e7ecd6; }.owner-eyebrow b { color: #adb3a8; font-weight: 400; }.owner-dashboard-head h1 { margin-top: 12px; color: #20261e; font-family: Manrope, sans-serif; font-size: 34px; font-weight: 800; }.owner-dashboard-head h1 em { color: #879744; font-style: normal; }.owner-dashboard-head p { margin-top: 7px; color: #7d8579; font-size: 10px; }.owner-head-actions { display: flex; align-items: center; gap: 9px; }.owner-locked { padding: 7px 9px; border: 1px solid #d5dec1; background: #f3f6e9; color: #596b3e; font-family: 'DM Mono', monospace; font-size: 7px; letter-spacing: .4px; }.owner-head-actions button { width: 31px; height: 31px; border: 1px solid #dce0d7; background: #fff; color: #606b5a; font-size: 17px; }.owner-head-actions button:disabled { opacity: .5; }
.owner-metrics { display: grid; grid-template-columns: repeat(4,1fr); margin-bottom: 22px; border: 1px solid #dce0d7; background: #fff; }.owner-metrics article { display: grid; min-width: 0; gap: 8px; padding: 14px 15px; border-right: 1px solid #e3e6df; }.owner-metrics article:last-child { border-right: 0; }.owner-metrics article > span,.owner-panel-head > div > span { color: #81897d; font-family: 'DM Mono', monospace; font-size: 7px; letter-spacing: .5px; }.owner-metrics article > strong { overflow: hidden; color: #252b23; font-family: Manrope, sans-serif; font-size: 20px; text-overflow: ellipsis; }.owner-metrics article > strong small { color: #7f8973; font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 500; }.owner-metrics article > i { color: #92998f; font-size: 8px; font-style: normal; }
.owner-login-section { margin: 0 0 22px; }.owner-login-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }.owner-login-heading h2 { color: #30382e; font-family: Manrope, sans-serif; font-size: 13px; }.owner-login-heading > span { color: #848b80; font-size: 8px; }.owner-login-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }.owner-login-grid article { display: grid; min-width: 0; gap: 8px; padding: 14px 16px; border: 1px solid #dce0d7; background: linear-gradient(135deg, #fff, #f7f9f2); }.owner-login-grid article > span { color: #737c6f; font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: .5px; }.owner-login-grid article > strong { color: #20261e; font-family: Manrope, sans-serif; font-size: 25px; line-height: 1.1; font-variant-numeric: tabular-nums; }.owner-login-grid article > i { color: #848b80; font-size: 8px; font-style: normal; }
.owner-activity-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 9px; border: 1px solid #dce0d7; background: #fff; }.owner-activity-summary > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 10px 13px; border-right: 1px solid #e5e8e1; }.owner-activity-summary > div:last-child { border-right: 0; }.owner-activity-summary span { color: #81897d; font-family: 'DM Mono', monospace; font-size: 7px; }.owner-activity-summary strong { color: #37432f; font-family: Manrope, sans-serif; font-size: 14px; font-variant-numeric: tabular-nums; }
.owner-analytics-warning { display: grid; gap: 5px; padding: 13px 15px; border: 1px solid #e4d7b4; background: #fbf7eb; color: #6d5a31; }.owner-analytics-warning strong { font-size: 10px; }.owner-analytics-warning span { color: #81734f; font-size: 9px; }
.owner-data-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr); gap: 14px; }.owner-data-panel { min-width: 0; border: 1px solid #dce0d7; background: #fff; }.owner-panel-head { display: flex; min-height: 62px; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #e5e8e1; }.owner-panel-head h2 { margin-top: 4px; color: #30382e; font-family: Manrope, sans-serif; font-size: 13px; }.owner-panel-head > small { color: #92998e; font-family: 'DM Mono', monospace; font-size: 7px; }.donor-table-wrap { overflow-x: auto; }.donor-table { width: 100%; border-collapse: collapse; text-align: left; white-space: nowrap; }.donor-table th { height: 31px; padding: 0 9px; border-bottom: 1px solid #eef0eb; background: #fafbf8; color: #8a9186; font-family: 'DM Mono', monospace; font-size: 6px; font-weight: 500; }.donor-table td { height: 42px; padding: 0 9px; border-bottom: 1px solid #f0f1ed; color: #596254; font-size: 8px; }.donor-table tr:last-child td { border-bottom: 0; }.donor-table td a { color: #5b694e; font-family: 'DM Mono', monospace; font-size: 8px; }.donor-rank,.donor-amount,.donor-transfer-count { font-family: 'DM Mono', monospace; }.donor-amount { color: #333b2d !important; font-weight: 600; }.donor-active { display: inline-flex; align-items: center; gap: 5px; color: #55713d; font-family: 'DM Mono', monospace; font-size: 6px; }.donor-active i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }.donor-active.inactive { color: #858b80; }
.recent-list article { display: grid; grid-template-columns: 21px minmax(0,1fr) auto 18px; align-items: center; gap: 8px; min-height: 50px; padding: 8px 11px; border-bottom: 1px solid #f0f1ed; }.recent-list article:last-child { border-bottom: 0; }.transfer-mark { display: grid; width: 18px; height: 18px; place-items: center; border-radius: 50%; background: #edf3e3; color: #648345; font-size: 11px; }.transfer-copy strong,.transfer-copy small { display: block; }.transfer-copy strong { color: #58634d; font-family: 'DM Mono', monospace; font-size: 7px; }.transfer-copy small { margin-top: 4px; color: #979d93; font-size: 7px; }.transfer-amount { color: #3e4c30; font-family: 'DM Mono', monospace; font-size: 8px; }.recent-list a { color: #77826d; font-size: 11px; }.owner-empty { padding: 24px 16px; color: #848b80; font-size: 9px; }.owner-data-note { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 11px 12px; border: 1px solid #dce0d7; background: #f8f9f5; color: #828a7e; font-size: 8px; }.owner-data-note > strong { flex: 0 0 auto; color: #536340; font-family: 'DM Mono', monospace; font-size: 7px; }.owner-data-note > span:nth-child(2) { flex: 1; line-height: 1.5; }.owner-data-note > span:last-child { flex: 0 0 auto; font-family: 'DM Mono', monospace; font-size: 7px; }
.owner-loading,.owner-error { display: flex; min-height: 90px; align-items: center; gap: 13px; padding: 18px; border: 1px solid #dce0d7; background: #fff; }.owner-loading strong,.owner-loading small,.owner-error strong,.owner-error span { display: block; }.owner-loading strong,.owner-error strong { color: #353d31; font-size: 10px; }.owner-loading small,.owner-error span { margin-top: 4px; color: #81897e; font-size: 9px; }.owner-error { border-left: 3px solid #b33b31; }.owner-error button { margin-left: auto; padding: 8px 10px; border: 1px solid #dce0d7; background: #f8f9f5; color: #424b3f; font-family: 'DM Mono', monospace; font-size: 8px; }
@media (max-width: 900px) { .owner-data-grid { grid-template-columns: 1fr; }.recent-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }.recent-list article:nth-child(2n) { border-left: 1px solid #f0f1ed; } }
@media (max-width: 650px) { .owner-dashboard { padding-top: 24px; }.owner-dashboard-head { align-items: flex-start; }.owner-dashboard-head h1 { font-size: 27px; }.owner-dashboard-head p { max-width: 270px; line-height: 1.55; }.owner-locked { font-size: 6px; }.owner-metrics { grid-template-columns: repeat(2,1fr); }.owner-metrics article { padding: 11px; border-bottom: 1px solid #e3e6df; }.owner-metrics article:nth-child(2) { border-right: 0; }.owner-metrics article:nth-child(3),.owner-metrics article:nth-child(4) { border-bottom: 0; }.owner-metrics article > strong { font-size: 17px; }.owner-login-heading { align-items: flex-start; flex-direction: column; gap: 4px; }.owner-login-grid { grid-template-columns: 1fr; gap: 8px; }.owner-login-grid article { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 5px 12px; padding: 11px 13px; }.owner-login-grid article > span { grid-column: 1; }.owner-login-grid article > strong { grid-column: 2; grid-row: 1 / span 2; font-size: 22px; }.owner-login-grid article > i { grid-column: 1; }.owner-activity-summary { grid-template-columns: 1fr; }.owner-activity-summary > div { border-right: 0; border-bottom: 1px solid #e5e8e1; }.owner-activity-summary > div:last-child { border-bottom: 0; }.recent-list { display: block; }.recent-list article:nth-child(2n) { border-left: 0; }.owner-data-note { align-items: flex-start; flex-wrap: wrap; }.owner-data-note > span:last-child { width: 100%; } }
@media (max-width: 760px) { .owner-active-users { grid-template-columns: 1fr; gap: 12px; } }
</style>