<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  claimDailyLoginReward,
  completeCobraTask,
  fetchCobraTasks,
  fetchDailyLoginReward,
  type CobraTask,
  type DailyLoginReward,
} from '../lib/api'

const props = defineProps<{ token?: string }>()
const emit = defineEmits<{ openLogin: [] }>()

const loading = ref(false)
const error = ref('')
const tasks = ref<CobraTask[]>([])
const totalPoints = ref(0)
const daily = ref<DailyLoginReward>({
  totalPoints: 0,
  streak: 0,
  longestStreak: 0,
  claimedToday: false,
  nextPoints: 50,
})
const proofTaskId = ref('')
const proofDraft = ref('')
const proofNotice = ref('')

async function load() {
  if (!props.token) return
  loading.value = true
  error.value = ''
  try {
    const [taskData, dailyData] = await Promise.all([
      fetchCobraTasks(props.token),
      fetchDailyLoginReward(props.token),
    ])
    tasks.value = taskData.tasks
    totalPoints.value = Math.max(taskData.totalPoints, dailyData.totalPoints)
    daily.value = dailyData
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load the Task Center.'
  } finally {
    loading.value = false
  }
}

async function claimLogin() {
  if (!props.token || daily.value.claimedToday) return
  error.value = ''
  try {
    const result = await claimDailyLoginReward(props.token)
    daily.value = result
    totalPoints.value = result.totalPoints
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not claim the daily reward.'
  }
}

async function completeTask(task: CobraTask) {
  if (!props.token || task.completed || task.submissionStatus === 'pending') return
  proofNotice.value = ''
  if (proofTaskId.value !== task.id) {
    proofTaskId.value = task.id
    proofDraft.value = ''
    if (task.actionUrl) window.open(task.actionUrl, '_blank', 'noopener,noreferrer')
    return
  }
  await submitTaskProof(task)
}

async function submitTaskProof(task: CobraTask) {
  if (!props.token) return
  error.value = ''
  try {
    const proof = proofDraft.value.trim().replace(/^@/, '')
    if (!proof) {
      error.value = 'Enter your username before submitting the task.'
      return
    }
    const result = await completeCobraTask(props.token, task.id, proof.trim())
    if (result.pending) {
      task.submissionStatus = 'pending'
      proofTaskId.value = ''
      proofDraft.value = ''
      proofNotice.value = 'Proof submitted. Your points will be added after an admin verifies the task.'
      return
    }
    task.completed = true
    totalPoints.value = result.totalPoints
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not complete this task.'
  }
}

onMounted(load)
watch(() => props.token, load)
</script>

<template>
  <section class="task-center-page">
    <header class="task-center-header">
      <div>
        <div class="scan-eyebrow"><span></span> COBRA COMMUNITY <b>/</b> TASK CENTER</div>
        <h1>Complete tasks. Earn <em>$COBRA points.</em></h1>
        <p>Build your streak, invite friends, and take part in community missions.</p>
      </div>
      <div class="task-total">
        <span>YOUR BALANCE</span>
        <strong>{{ totalPoints.toLocaleString() }} <small>PTS</small></strong>
      </div>
    </header>

    <div v-if="!token" class="task-login-panel">
      <span>COMMUNITY REWARDS</span>
      <h2>Sign in to start earning</h2>
      <p>Daily streaks, invite rewards, and public missions are connected to your account.</p>
      <button type="button" @click="emit('openLogin')">SIGN IN / CREATE ACCOUNT</button>
    </div>

    <template v-else>
      <p v-if="error" class="task-center-error" role="alert">{{ error }}</p>
      <p v-if="proofNotice" class="task-proof-notice" role="status">{{ proofNotice }}</p>
      <div class="daily-login-card">
        <div class="daily-login-copy">
          <span class="task-label">DAILY LOGIN</span>
          <h2>{{ daily.claimedToday ? 'Today’s reward collected' : 'Your next reward is ready' }}</h2>
          <p>Keep logging in every day. Rewards increase from 50 points to 100 points across a 100-day streak.</p>
        </div>
        <div class="streak-score">
          <span>{{ daily.streak }}<small>DAY STREAK</small></span>
          <span>{{ daily.longestStreak }}<small>BEST STREAK</small></span>
        </div>
        <button type="button" :disabled="loading || daily.claimedToday" @click="claimLogin">
          {{ daily.claimedToday ? 'CLAIMED TODAY' : `CLAIM +${daily.nextPoints} PTS` }}
        </button>
      </div>

      <section class="task-mission-panel" aria-labelledby="task-missions-heading">
        <div class="task-section-head">
          <div><span class="task-label">COMMUNITY MISSIONS</span><h2 id="task-missions-heading">Available tasks</h2></div>
          <span>{{ tasks.filter((task) => !task.completed).length }} ACTIVE</span>
        </div>
        <p v-if="loading">Loading missions…</p>
        <article v-for="task in tasks" :key="task.id" class="task-mission-row">
          <div class="task-status-icon">{{ task.completed ? '✓' : '+' }}</div>
          <div>
            <strong>{{ task.title }}</strong>
            <p>{{ task.description }}</p>
            <small v-if="task.taskType === 'social'" class="task-social-meta">{{ task.platform || 'SOCIAL' }} · {{ task.verification === 'manual' ? 'ADMIN VERIFIED' : 'SOCIAL TASK' }}</small>
            <a v-if="task.actionUrl" :href="task.actionUrl" target="_blank" rel="noopener noreferrer">OPEN {{ task.platform || 'TASK' }}</a>
            <small v-if="task.submissionStatus === 'rejected'" class="task-rejected-note">Review rejected: {{ task.submissionReviewNote || 'Update your proof and submit again.' }}</small>
          </div>
          <span>+{{ task.points.toLocaleString() }} PTS</span>
          <button type="button" :disabled="task.completed || task.submissionStatus === 'pending'" @click="completeTask(task)">
            {{ task.completed ? 'COMPLETED' : task.submissionStatus === 'pending' ? 'AWAITING REVIEW' : task.submissionStatus === 'rejected' ? 'RESUBMIT PROOF' : task.actionUrl ? 'OPEN POST & VERIFY' : 'SUBMIT PROOF' }}
          </button>
          <div v-if="proofTaskId === task.id" class="task-proof-form">
            <label>{{ task.proofLabel || 'Your social username' }}
              <input v-model="proofDraft" maxlength="120" :placeholder="task.platform ? `${task.platform} username` : 'username'" autocomplete="off" />
            </label>
            <small>1. Complete the action on the opened post. 2. Enter the {{ task.platform || 'social' }} username used. 3. Wait for admin verification. Points are not claimed until verification.</small>
            <button type="button" :disabled="!proofDraft.trim()" @click="submitTaskProof(task)">SUBMIT FOR REVIEW</button>
          </div>
        </article>
        <p v-if="!loading && tasks.length === 0">No public missions are live yet.</p>
      </section>
    </template>
  </section>
</template>

    <style scoped>
    .task-center-page {
      width: min(1180px, 100%);
      display: grid;
      gap: 20px;
      padding: 0 0 64px;
    }
    .task-center-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
    .task-center-header h1 { margin: 10px 0 8px; color: #edf4f4; font-size: clamp(2rem, 5vw, 4rem); line-height: 1; }
    .task-center-header h1 em { color: #89f0b1; font-style: normal; }
    .task-center-header p { margin: 0; color: #91a0a4; }
    .task-total { min-width: 190px; padding: 18px; border: 1px solid rgba(143, 224, 170, .24); border-radius: 12px; background: rgba(91, 177, 126, .08); }
    .task-total span, .task-label { color: #78d99d; font: 700 .68rem 'DM Mono', monospace; letter-spacing: .12em; }
    .task-total strong { display: block; margin-top: 6px; color: white; font-size: 1.8rem; }
    .task-total small { color: #91a0a4; font-size: .68rem; }
    .scan-eyebrow { color: #8a999d; font: 700 .66rem 'DM Mono', monospace; letter-spacing: .09em; }
    .scan-eyebrow span { display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; background: #8ff0b1; box-shadow: 0 0 12px rgba(143, 240, 177, .8); }
    .scan-eyebrow b { margin: 0 5px; color: #5f7074; }
    .task-login-panel, .daily-login-card, .task-mission-panel { border: 1px solid rgba(174, 195, 199, .14); border-radius: 16px; background: rgba(7, 18, 19, .92); }
    .task-login-panel { padding: 38px; text-align: center; }
    .task-login-panel > span { color: #78d99d; font: 700 .68rem 'DM Mono', monospace; letter-spacing: .12em; }
    .task-login-panel h2 { margin: 12px 0 8px; font-size: 2rem; }
    .task-login-panel p { color: #91a0a4; }
    .task-login-panel button, .daily-login-card button, .task-mission-row button { min-height: 42px; border: 0; border-radius: 8px; background: #8ff0b1; color: #092019; font: 800 .72rem 'DM Mono', monospace; letter-spacing: .06em; cursor: pointer; }
    .task-login-panel button { padding: 0 18px; }
    .task-login-panel button:hover, .daily-login-card button:hover, .task-mission-row button:hover { transform: translateY(-1px); }
    button:disabled { opacity: .55; cursor: not-allowed; transform: none !important; }
    .daily-login-card { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(150px, .25fr); gap: 24px; align-items: center; padding: 28px; }
    .daily-login-copy h2, .task-section-head h2 { margin: 7px 0 6px; font-size: 1.35rem; }
    .daily-login-copy p { max-width: 620px; margin: 0; color: #91a0a4; line-height: 1.55; }
    .streak-score { display: flex; gap: 12px; }
    .streak-score span { min-width: 96px; padding: 12px; border-radius: 10px; background: rgba(141, 240, 177, .07); text-align: center; color: #dff9e8; font-size: 1.8rem; font-weight: 800; }
    .streak-score small { display: block; color: #819096; font-size: .58rem; }
    .daily-login-card button { padding: 0 18px; }
    .task-center-error { margin: 0; padding: 12px 14px; border: 1px solid rgba(255, 112, 112, .28); border-radius: 8px; background: rgba(255, 72, 72, .08); color: #ffc3c3; }
    .task-mission-panel { overflow: hidden; }
    .task-section-head { display: flex; align-items: center; justify-content: space-between; padding: 22px 24px; border-bottom: 1px solid rgba(174, 195, 199, .1); }
    .task-section-head > span { color: #819096; font: 700 .65rem 'DM Mono', monospace; letter-spacing: .08em; }
    .task-mission-panel > p { padding: 18px 24px; color: #91a0a4; }
    .task-mission-row { display: grid; grid-template-columns: 42px minmax(0, 1fr) 120px 130px; gap: 16px; align-items: center; padding: 18px 24px; border-bottom: 1px solid rgba(174, 195, 199, .08); }
    .task-mission-row:last-child { border-bottom: 0; }
    .task-status-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: rgba(143, 240, 177, .1); color: #8ff0b1; font-weight: 800; }
    .task-mission-row strong { color: #edf4f4; }
    .task-mission-row p { margin: 4px 0 0; color: #819096; font-size: .86rem; }
    .task-mission-row > span { color: #8ff0b1; font: 700 .72rem 'DM Mono', monospace; text-align: right; }
    .task-mission-row button { padding: 0 12px; }
    .task-proof-form { grid-column: 2 / -1; display: grid; gap: 7px; margin-top: 4px; padding: 12px; border: 1px solid rgba(143,240,177,.18); border-radius: 8px; background: rgba(143,240,177,.04); }
    .task-proof-form label { display: grid; gap: 5px; color: #d9e7e8; font-size: .75rem; font-weight: 700; }
    .task-proof-form input { min-height: 38px; border: 1px solid rgba(174,195,199,.18); border-radius: 6px; background: #091719; color: #edf4f4; padding: 0 10px; }
    .task-proof-form small { color: #819096; }
    .task-proof-form button { justify-self: start; padding: 0 12px; }
    .task-proof-notice { margin: 0; padding: 12px 14px; border: 1px solid rgba(143,240,177,.24); border-radius: 8px; background: rgba(143,240,177,.07); color: #a9f1c4; font-size: .82rem; }
    @media (max-width: 760px) {
      .task-center-header, .daily-login-card { align-items: stretch; flex-direction: column; display: grid; grid-template-columns: 1fr; }
      .task-total { min-width: 0; }
      .streak-score span { flex: 1; }
      .task-mission-row { grid-template-columns: 42px 1fr; }
      .task-mission-row > span { grid-column: 2; text-align: left; }
      .task-mission-row button { grid-column: 2; }
    }
    </style>
