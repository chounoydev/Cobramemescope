<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { MessageCircle, Send, Sparkles, X } from '@lucide/vue'
import { askMemeScopeAssistant, type AssistantMessage } from '../lib/api'

const props = defineProps<{ scanContext: string; authToken: string }>()

const isOpen = ref(false)
const draft = ref('')
const loading = ref(false)
const errorMessage = ref('')
const conversation = ref<AssistantMessage[]>([
  {
    role: 'model',
    text: 'Hi, I’m Cobra Guide. I can help you use Cobra MemeScope, understand its features, and explain scan or market information. What would you like help with?',
  },
])
const conversationElement = ref<HTMLElement | null>(null)
const suggestedQuestions = [
  'How do I scan a token?',
  'How do I search and save a new launch?',
  'What does an unknown scan check mean?',
]

watch(() => props.authToken, () => {
  conversation.value = [{
    role: 'model',
    text: 'Hi, I’m Cobra Guide. I can help you use Cobra MemeScope, understand its features, and explain scan or market information. What would you like help with?',
  }]
  draft.value = ''
  errorMessage.value = ''
})

watch(isOpen, async (open) => {
  if (!open) return
  await nextTick()
  conversationElement.value?.scrollTo({ top: conversationElement.value.scrollHeight })
})

async function scrollToLatest() {
  await nextTick()
  conversationElement.value?.scrollTo({ top: conversationElement.value.scrollHeight, behavior: 'smooth' })
}

async function sendMessage(question = draft.value) {
  const text = question.trim()
  if (!text || loading.value || !props.authToken) return

  const history = conversation.value.slice(1).slice(-6).map((entry) => ({ ...entry, text: entry.text.slice(0, 700) }))
  conversation.value.push({ role: 'user', text })
  draft.value = ''
  errorMessage.value = ''
  loading.value = true
  void scrollToLatest()
  try {
    const answer = await askMemeScopeAssistant(text, history, props.scanContext, props.authToken)
    conversation.value.push({ role: 'model', text: answer })
    await scrollToLatest()
  } catch (error) {
    conversation.value.pop()
    draft.value = text
    errorMessage.value = error instanceof Error ? error.message : 'The AI guide could not answer right now.'
  } finally {
    loading.value = false
  }
}

function requestSignIn() {
  window.dispatchEvent(new Event('memescope:open-login'))
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void sendMessage()
  }
}
</script>

<template>
  <div class="assistant-chat">
    <button v-if="!isOpen" class="assistant-launcher" type="button" :aria-expanded="isOpen" aria-label="Ask Cobra Guide" @click="isOpen = true">
      <MessageCircle :size="19" />
      <span>Ask Cobra Guide</span>
    </button>

    <section v-if="isOpen" class="assistant-panel" aria-label="Cobra Guide AI assistant">
      <header class="assistant-header">
        <div class="assistant-brand-icon"><Sparkles :size="17" /></div>
        <div class="assistant-heading"><strong>Cobra Guide</strong><span>COBRA MEMESCOPE AI ASSISTANT</span></div>
        <button class="assistant-close" type="button" aria-label="Close Cobra Guide" @click="isOpen = false"><X :size="18" /></button>
      </header>

      <div v-if="!authToken" class="assistant-login-gate">
        <Sparkles :size="24" />
        <strong>Sign in to use the AI assistant</strong>
        <p>Log in with your email or connect a wallet to chat with Cobra Guide.</p>
        <button type="button" @click="requestSignIn">Sign in or connect wallet</button>
      </div>
      <div v-else class="assistant-content">
        <div ref="conversationElement" class="assistant-conversation" aria-live="polite">
          <article v-for="(entry, index) in conversation" :key="index" class="assistant-message" :class="`message-${entry.role}`">
            <span v-if="entry.role === 'model'" class="assistant-message-mark"><Sparkles :size="13" /></span>
            <p>{{ entry.text }}</p>
          </article>
          <div v-if="loading" class="assistant-message message-model assistant-loading" role="status">
            <span class="assistant-message-mark"><Sparkles :size="13" /></span><p><i></i><i></i><i></i><span>Thinking…</span></p>
          </div>
          <p v-if="errorMessage" class="assistant-error" role="alert">{{ errorMessage }}</p>
        </div>

        <div v-if="conversation.length === 1" class="assistant-suggestions" aria-label="Suggested questions">
          <button v-for="question in suggestedQuestions" :key="question" type="button" :disabled="loading" @click="sendMessage(question)">{{ question }}</button>
        </div>

        <form class="assistant-composer" @submit.prevent="sendMessage()">
          <label class="visually-hidden" for="assistant-question">Ask Cobra Guide</label>
          <textarea id="assistant-question" v-model="draft" rows="2" maxlength="1500" placeholder="Ask about Cobra MemeScope or a scan…" :disabled="loading" @keydown="handleComposerKeydown"></textarea>
          <button type="submit" aria-label="Send question" :disabled="loading || !draft.trim()"><Send :size="17" /></button>
        </form>
        <p class="assistant-disclaimer">AI can be wrong. Scan results are indicators, not guarantees or financial advice.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.assistant-chat { position: fixed; z-index: 1200; right: max(22px, env(safe-area-inset-right)); bottom: max(22px, env(safe-area-inset-bottom)); display: grid; justify-items: end; gap: 12px; font-family: 'DM Sans', sans-serif; }
.assistant-launcher { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; gap: 9px; padding: 0 17px; border: 1px solid #8bffbe; border-radius: 999px; background: #7af7b3; color: #06211a; box-shadow: 0 8px 28px rgb(0 0 0 / 34%); font: 800 13px 'DM Sans', sans-serif; cursor: pointer; }
.assistant-launcher:hover { background: #a0ffcb; }
.assistant-panel { display: grid; grid-template-rows: auto minmax(0, 1fr); width: min(390px, calc(100vw - 32px)); height: min(570px, calc(100dvh - 100px)); overflow: hidden; border: 1px solid rgba(122, 247, 179, .28); border-radius: 18px; background: #071b20; color: #edf4f6; box-shadow: 0 22px 72px rgb(0 0 0 / 54%); }
.assistant-content { display: grid; grid-template-rows: minmax(0, 1fr) auto auto auto; min-height: 0; overflow: hidden; }
.assistant-login-gate { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; color: #7af7b3; text-align: center; }
.assistant-login-gate strong { color: #edf4f6; font-size: 15px; }
.assistant-login-gate p { max-width: 270px; margin: 0; color: #a9bdbf; font-size: 12px; line-height: 1.5; }
.assistant-login-gate button { min-height: 40px; padding: 0 14px; border: 0; border-radius: 9px; background: #7af7b3; color: #06211a; font: 700 12px 'DM Sans', sans-serif; cursor: pointer; }
.assistant-header { display: flex; align-items: center; gap: 11px; padding: 16px; border-bottom: 1px solid rgba(169, 186, 189, .16); background: linear-gradient(110deg, #102a2d, #0a1d22); }
.assistant-brand-icon { display: grid; width: 35px; height: 35px; place-items: center; border: 1px solid rgba(122, 247, 179, .38); border-radius: 11px; background: rgba(122, 247, 179, .1); color: #7af7b3; }
.assistant-heading { display: grid; flex: 1; gap: 3px; }
.assistant-heading strong { font-size: 14px; }
.assistant-heading span { color: #91adaf; font: 700 9px 'DM Mono', monospace; letter-spacing: .12em; }
.assistant-close { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid rgba(169, 186, 189, .2); border-radius: 50%; background: transparent; color: #d9e7e8; cursor: pointer; }
.assistant-conversation { display: flex; min-height: 0; flex-direction: column; gap: 12px; overflow: auto; padding: 17px 14px; scrollbar-color: #31504e transparent; }
.assistant-message { display: flex; align-items: flex-start; gap: 8px; max-width: 91%; }
.assistant-message p { margin: 0; padding: 11px 12px; border: 1px solid rgba(169, 186, 189, .12); border-radius: 4px 13px 13px; background: #10272b; color: #dce8e9; font-size: 13px; line-height: 1.58; white-space: pre-wrap; overflow-wrap: anywhere; }
.message-user { align-self: flex-end; }
.message-user p { border-color: rgba(122, 247, 179, .18); border-radius: 13px 4px 13px 13px; background: #14352e; color: #e7f8ee; }
.assistant-message-mark { display: grid; flex: 0 0 23px; width: 23px; height: 23px; margin-top: 3px; place-items: center; border-radius: 50%; background: rgba(122, 247, 179, .12); color: #7af7b3; }
.assistant-loading p { display: flex; align-items: center; gap: 4px; min-width: 105px; }
.assistant-loading i { width: 5px; height: 5px; border-radius: 50%; background: #7af7b3; animation: assistant-pulse 1s infinite ease-in-out; }
.assistant-loading i:nth-child(2) { animation-delay: .15s; }
.assistant-loading i:nth-child(3) { animation-delay: .3s; }
.assistant-loading p span { margin-left: 5px; color: #a9bdbf; font-size: 11px; }
.assistant-suggestions { display: flex; flex-wrap: wrap; gap: 7px; padding: 0 14px 12px; }
.assistant-suggestions button { padding: 7px 9px; border: 1px solid rgba(122, 247, 179, .22); border-radius: 999px; background: rgba(122, 247, 179, .06); color: #c9e7d5; font: 11px 'DM Sans', sans-serif; text-align: left; cursor: pointer; }
.assistant-suggestions button:hover:not(:disabled) { border-color: #7af7b3; }
.assistant-suggestions button:disabled { opacity: .55; }
.assistant-composer { display: flex; align-items: flex-end; gap: 8px; margin: 0 12px; padding: 8px; border: 1px solid rgba(169, 186, 189, .2); border-radius: 13px; background: #0b2226; }
.assistant-composer:focus-within { border-color: rgba(122, 247, 179, .58); }
.assistant-composer textarea { width: 100%; min-height: 42px; max-height: 100px; resize: vertical; border: 0; outline: 0; background: transparent; color: #edf4f6; font: 13px/1.5 'DM Sans', sans-serif; }
.assistant-composer textarea::placeholder { color: #82999c; }
.assistant-composer button { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border: 0; border-radius: 10px; background: #7af7b3; color: #06211a; cursor: pointer; }
.assistant-composer button:disabled { opacity: .4; cursor: not-allowed; }
.assistant-disclaimer { margin: 8px 14px 12px; color: #80999b; font-size: 10px; line-height: 1.45; }
.assistant-error { align-self: stretch; margin: 0 2px; padding: 9px 10px; border: 1px solid rgba(255, 125, 125, .3); border-radius: 9px; background: rgba(113, 37, 37, .22); color: #ffb0a8; font-size: 11px; line-height: 1.5; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
@keyframes assistant-pulse { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
@media (max-width: 760px) { .assistant-chat { bottom: calc(84px + env(safe-area-inset-bottom)); } }
@media (max-width: 480px) { .assistant-chat { right: 14px; } .assistant-panel { width: calc(100vw - 28px); height: min(620px, calc(100dvh - 85px)); } }
@media (prefers-reduced-motion: reduce) { .assistant-loading i { animation: none; } }
</style>
