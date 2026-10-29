<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchAdminChatAttachment, fetchAdminChatMessages, sendAdminChatMessage, uploadAdminChatAttachment, type AdminChatMessage } from '../lib/api'

const props = defineProps<{
  token: string
  walletAddress: string
  role: 'owner' | 'staff'
}>()

const allowedTypes = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['pdf', 'application/pdf'],
  ['txt', 'text/plain'],
  ['csv', 'text/csv'],
])
const maxFileSize = 8 * 1024 * 1024
const messages = ref<AdminChatMessage[]>([])
const draft = ref('')
const selectedFile = ref<File | null>(null)
const loading = ref(true)
const sending = ref(false)
const errorMessage = ref('')
const attachmentPreviews = ref<Record<string, string>>({})
const attemptedPreviews = new Set<string>()
const conversation = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
let refreshTimer: number | undefined
let active = true
let requestInProgress = false
let firstLoad = true
let stickToLatest = true

const ownAddress = computed(() => props.walletAddress.toLowerCase())
const selectedFileType = computed(() => selectedFile.value ? mimeTypeForFile(selectedFile.value) : '')
const selectedImagePreview = ref('')

function mimeTypeForFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  return allowedTypes.get(extension) || file.type
}

function messageIsOwn(message: AdminChatMessage) {
  return message.senderWalletAddress.toLowerCase() === ownAddress.value
}

function isImage(message: AdminChatMessage) {
  return Boolean(message.attachmentContentType?.startsWith('image/'))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function updateStickToLatest() {
  const element = conversation.value
  if (!element) return
  stickToLatest = element.scrollHeight - element.scrollTop - element.clientHeight < 90
}

async function scrollToLatest() {
  await nextTick()
  if (stickToLatest && conversation.value) conversation.value.scrollTop = conversation.value.scrollHeight
}

async function loadPreview(message: AdminChatMessage) {
  if (!isImage(message) || attemptedPreviews.has(message.id)) return
  attemptedPreviews.add(message.id)
  try {
    const blob = await fetchAdminChatAttachment(props.token, message.id)
    const url = URL.createObjectURL(blob)
    if (!active) {
      URL.revokeObjectURL(url)
      return
    }
    attachmentPreviews.value = { ...attachmentPreviews.value, [message.id]: url }
  } catch (error) {
    if (active) console.warn('Could not preview an admin chat image:', error)
  }
}

async function loadMessages() {
  if (!props.token || requestInProgress) return
  requestInProgress = true
  const shouldScroll = firstLoad || stickToLatest
  try {
    const nextMessages = await fetchAdminChatMessages(props.token)
    if (!active) return
    const visibleIds = new Set(nextMessages.map((message) => message.id))
    for (const [id, url] of Object.entries(attachmentPreviews.value)) {
      if (!visibleIds.has(id)) {
        URL.revokeObjectURL(url)
        delete attachmentPreviews.value[id]
        attemptedPreviews.delete(id)
      }
    }
    messages.value = nextMessages
    errorMessage.value = ''
    firstLoad = false
    stickToLatest = shouldScroll || nextMessages.length === 0
    await scrollToLatest()
    const latestImages = nextMessages.filter(isImage).slice(-12)
    void Promise.all(latestImages.map(loadPreview))
  } catch (error) {
    if (active) errorMessage.value = error instanceof Error ? error.message : 'Could not load the admin chat.'
  } finally {
    requestInProgress = false
    loading.value = false
  }
}

function chooseAttachment() {
  fileInput.value?.click()
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!allowedTypes.has(file.name.split('.').pop()?.toLowerCase() || '')) {
    errorMessage.value = 'Choose a JPEG, PNG, WebP, GIF, PDF, TXT, or CSV file.'
    return
  }
  if (file.size > maxFileSize) {
    errorMessage.value = 'Attachments must be 8 MB or smaller.'
    return
  }
  clearSelectedFile()
  selectedFile.value = file
  if (mimeTypeForFile(file).startsWith('image/')) selectedImagePreview.value = URL.createObjectURL(file)
  errorMessage.value = ''
}

function clearSelectedFile() {
  if (selectedImagePreview.value) URL.revokeObjectURL(selectedImagePreview.value)
  selectedImagePreview.value = ''
  selectedFile.value = null
}

async function submitMessage() {
  const text = draft.value.trim()
  const file = selectedFile.value
  if ((!text && !file) || sending.value) return
  sending.value = true
  errorMessage.value = ''
  try {
    if (file) await uploadAdminChatAttachment(props.token, file, selectedFileType.value, text)
    else await sendAdminChatMessage(props.token, text)
    draft.value = ''
    clearSelectedFile()
    stickToLatest = true
    await loadMessages()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not send this message.'
  } finally {
    sending.value = false
  }
}

async function downloadAttachment(message: AdminChatMessage) {
  if (!message.attachmentName) return
  try {
    const blob = await fetchAdminChatAttachment(props.token, message.id)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = message.attachmentName
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not download this attachment.'
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    void submitMessage()
  }
}

onMounted(() => {
  void loadMessages()
  refreshTimer = window.setInterval(() => { void loadMessages() }, 8000)
})

onBeforeUnmount(() => {
  active = false
  window.clearInterval(refreshTimer)
  for (const url of Object.values(attachmentPreviews.value)) URL.revokeObjectURL(url)
  if (selectedImagePreview.value) URL.revokeObjectURL(selectedImagePreview.value)
})
</script>

<template>
  <section class="admin-chat" aria-labelledby="admin-chat-title">
    <header class="admin-chat-heading">
      <div>
        <div class="admin-chat-eyebrow"><span></span> PRIVATE TEAM CHANNEL <b>/</b> {{ role.toUpperCase() }}</div>
        <h1 id="admin-chat-title">Admin chat<em>.</em></h1>
        <p>A shared room for the Cobra MemeScope admin team. Messages and attachments are visible to authorized staff.</p>
      </div>
      <div class="admin-chat-live"><span></span> SHARED ROOM</div>
    </header>

    <div class="admin-chat-panel">
      <header class="admin-chat-room-header">
        <div class="admin-chat-room-mark" aria-hidden="true">C</div>
        <div><strong>Team room</strong><span>Owner and approved staff</span></div>
        <button type="button" class="admin-chat-refresh" :disabled="loading" aria-label="Refresh team chat" @click="void loadMessages()">↻</button>
      </header>

      <div ref="conversation" class="admin-chat-messages" aria-live="polite" @scroll="updateStickToLatest">
        <div v-if="loading && !messages.length" class="admin-chat-empty" role="status">
          <span class="admin-chat-spinner"></span>
          <strong>Opening the team room…</strong>
        </div>
        <div v-else-if="!messages.length && !errorMessage" class="admin-chat-empty">
          <span class="admin-chat-empty-mark">C</span>
          <strong>Start the conversation</strong>
          <p>Share an update or attach a file for the team.</p>
        </div>
        <article
          v-for="message in messages"
          :key="message.id"
          class="admin-chat-message"
          :class="{ 'is-own-message': messageIsOwn(message) }"
        >
          <div class="admin-chat-avatar" aria-hidden="true">{{ message.senderName.slice(0, 1).toUpperCase() }}</div>
          <div class="admin-chat-message-body">
            <div class="admin-chat-message-meta">
              <strong>{{ messageIsOwn(message) ? 'You' : message.senderName }}</strong>
              <time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time>
            </div>
            <div class="admin-chat-bubble">
              <p v-if="message.message" class="admin-chat-message-text">{{ message.message }}</p>
              <button
                v-if="message.attachmentName && isImage(message) && attachmentPreviews[message.id]"
                type="button"
                class="admin-chat-image-button"
                :aria-label="`Download image ${message.attachmentName}`"
                @click="void downloadAttachment(message)"
              >
                <img :src="attachmentPreviews[message.id]" :alt="message.attachmentName" loading="lazy" />
              </button>
              <button v-if="message.attachmentName" type="button" class="admin-chat-file" @click="void downloadAttachment(message)">
                <span class="admin-chat-file-icon" aria-hidden="true">{{ isImage(message) ? '▧' : '↧' }}</span>
                <span><strong>{{ message.attachmentName }}</strong><small>{{ message.attachmentContentType }}</small></span>
                <span class="admin-chat-download" aria-hidden="true">↓</span>
              </button>
            </div>
          </div>
        </article>
        <div v-if="errorMessage && !messages.length" class="admin-chat-error" role="alert">
          <strong>Chat unavailable</strong><span>{{ errorMessage }}</span>
          <button type="button" @click="void loadMessages()">TRY AGAIN ↻</button>
        </div>
      </div>

      <form class="admin-chat-composer" @submit.prevent="submitMessage">
        <div v-if="selectedFile" class="admin-chat-selected-file">
          <img v-if="selectedImagePreview" :src="selectedImagePreview" alt="" />
          <span v-else class="admin-chat-file-icon" aria-hidden="true">↧</span>
          <span><strong>{{ selectedFile.name }}</strong><small>{{ formatSize(selectedFile.size) }} · {{ selectedFileType }}</small></span>
          <button type="button" aria-label="Remove attachment" @click="clearSelectedFile">×</button>
        </div>
        <p v-if="errorMessage && messages.length" class="admin-chat-inline-error" role="alert">{{ errorMessage }}</p>
        <div class="admin-chat-compose-row">
          <input
            ref="fileInput"
            class="admin-chat-file-input"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.csv,image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv"
            aria-label="Choose an image or file to attach"
            @change="selectFile"
          />
          <button type="button" class="admin-chat-attach" aria-label="Attach an image or file" :disabled="sending" @click="chooseAttachment">＋</button>
          <label class="admin-chat-input-label" for="admin-chat-message">Message the team</label>
          <textarea
            id="admin-chat-message"
            v-model="draft"
            rows="2"
            maxlength="2000"
            placeholder="Write a message…"
            :disabled="sending"
            @keydown="handleComposerKeydown"
          ></textarea>
          <button type="submit" class="admin-chat-send" :disabled="sending || (!draft.trim() && !selectedFile)" aria-label="Send message">
            {{ sending ? '…' : '↑' }}
          </button>
        </div>
        <div class="admin-chat-composer-foot"><span>JPEG, PNG, WebP, GIF, PDF, TXT, CSV · Up to 8 MB</span><span>CTRL / ⌘ + ENTER TO SEND</span></div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.admin-chat { display: grid; gap: 20px; color: #edf2eb; font-family: 'DM Sans', sans-serif; }
.admin-chat-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; padding: 18px 2px 2px; }
.admin-chat-eyebrow { display: flex; align-items: center; gap: 8px; color: #8d9b8c; font: 700 9px 'DM Mono', monospace; letter-spacing: .13em; }
.admin-chat-eyebrow > span,.admin-chat-live > span { width: 7px; height: 7px; border-radius: 50%; background: #79efae; box-shadow: 0 0 10px #79efae; }
.admin-chat-eyebrow b { color: #4a584b; }
.admin-chat-heading h1 { margin: 10px 0 5px; color: #f3f5ef; font: 800 clamp(28px, 4vw, 40px) Manrope, sans-serif; letter-spacing: -.06em; }
.admin-chat-heading h1 em { color: #ff803d; font-style: normal; }
.admin-chat-heading p { max-width: 660px; margin: 0; color: #a0aca0; font-size: 13px; line-height: 1.6; }
.admin-chat-live { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 8px; padding: 9px 11px; border: 1px solid rgba(121, 239, 174, .18); border-radius: 999px; background: rgba(121, 239, 174, .06); color: #a7dcb9; font: 700 9px 'DM Mono', monospace; letter-spacing: .08em; }
.admin-chat-live > span { width: 6px; height: 6px; }
.admin-chat-panel { display: grid; grid-template-rows: auto minmax(300px, 1fr) auto; min-height: min(680px, calc(100dvh - 230px)); overflow: hidden; border: 1px solid rgba(146, 164, 143, .18); border-radius: 14px; background: linear-gradient(160deg, rgba(17, 26, 20, .98), rgba(8, 14, 14, .99)); box-shadow: 0 20px 55px rgba(0, 0, 0, .22); }
.admin-chat-room-header { display: flex; align-items: center; gap: 11px; padding: 14px 18px; border-bottom: 1px solid rgba(146, 164, 143, .14); background: rgba(25, 36, 27, .7); }
.admin-chat-room-mark,.admin-chat-avatar,.admin-chat-empty-mark { display: grid; flex: 0 0 auto; width: 36px; height: 36px; place-items: center; border: 1px solid rgba(255, 128, 61, .28); border-radius: 11px; background: rgba(255, 128, 61, .1); color: #ff9a5c; font: 800 15px Manrope, sans-serif; }
.admin-chat-room-header > div:nth-child(2) { display: grid; gap: 3px; }
.admin-chat-room-header strong { color: #ecf1e9; font-size: 13px; }
.admin-chat-room-header > div:nth-child(2) span { color: #8e9b8d; font-size: 11px; }
.admin-chat-refresh { display: grid; width: 34px; height: 34px; place-items: center; margin-left: auto; border: 1px solid rgba(146, 164, 143, .2); border-radius: 9px; background: transparent; color: #bec9bc; font-size: 19px; cursor: pointer; }
.admin-chat-refresh:hover:not(:disabled) { border-color: #ff803d; color: #ff9a5c; }
.admin-chat-refresh:disabled { opacity: .5; cursor: wait; }
.admin-chat-messages { display: flex; min-height: 300px; flex-direction: column; gap: 18px; overflow-y: auto; padding: 22px clamp(14px, 4vw, 36px); scrollbar-color: #435446 transparent; }
.admin-chat-empty { display: grid; flex: 1; align-content: center; justify-items: center; gap: 10px; min-height: 240px; color: #e6ece3; text-align: center; }
.admin-chat-empty-mark { width: 50px; height: 50px; border-radius: 15px; font-size: 20px; }
.admin-chat-empty strong { font-size: 14px; }
.admin-chat-empty p { margin: 0; color: #8e9b8d; font-size: 12px; }
.admin-chat-spinner { width: 23px; height: 23px; border: 2px solid rgba(255, 128, 61, .2); border-top-color: #ff803d; border-radius: 50%; animation: admin-chat-spin .8s linear infinite; }
@keyframes admin-chat-spin { to { transform: rotate(360deg); } }
.admin-chat-message { display: flex; align-items: flex-start; gap: 10px; max-width: min(760px, 92%); }
.admin-chat-message.is-own-message { align-self: flex-end; flex-direction: row-reverse; }
.admin-chat-avatar { width: 31px; height: 31px; border-radius: 50%; border-color: rgba(129, 199, 157, .2); background: rgba(72, 131, 87, .15); color: #a6d9af; font-size: 12px; }
.is-own-message .admin-chat-avatar { border-color: rgba(255, 128, 61, .24); background: rgba(255, 128, 61, .12); color: #ff9a5c; }
.admin-chat-message-body { min-width: 0; }
.admin-chat-message-meta { display: flex; align-items: baseline; gap: 9px; margin: 0 2px 5px; }
.admin-chat-message-meta strong { color: #d7e1d4; font-size: 11px; }
.admin-chat-message-meta time { color: #748174; font: 10px 'DM Mono', monospace; }
.is-own-message .admin-chat-message-meta { justify-content: flex-end; }
.admin-chat-bubble { display: grid; gap: 8px; width: fit-content; max-width: 100%; padding: 11px 13px; border: 1px solid rgba(137, 162, 137, .16); border-radius: 4px 13px 13px; background: rgba(28, 40, 30, .88); }
.is-own-message .admin-chat-bubble { margin-left: auto; border-color: rgba(255, 128, 61, .18); border-radius: 13px 4px 13px 13px; background: rgba(74, 38, 22, .45); }
.admin-chat-message-text { margin: 0; color: #e7ece4; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; white-space: pre-wrap; }
.admin-chat-image-button { display: block; max-width: min(400px, 65vw); padding: 0; overflow: hidden; border: 1px solid rgba(255, 255, 255, .1); border-radius: 9px; background: #101510; cursor: zoom-in; }
.admin-chat-image-button img { display: block; max-width: 100%; max-height: 320px; object-fit: contain; }
.admin-chat-file { display: flex; min-width: min(260px, 58vw); align-items: center; gap: 10px; padding: 9px; border: 1px solid rgba(146, 164, 143, .16); border-radius: 9px; background: rgba(0, 0, 0, .18); color: #dce5d8; text-align: left; cursor: pointer; }
.admin-chat-file:hover { border-color: rgba(255, 128, 61, .55); }
.admin-chat-file-icon { display: grid; flex: 0 0 auto; width: 34px; height: 34px; place-items: center; border-radius: 9px; background: rgba(255, 128, 61, .12); color: #ff9a5c; font-size: 19px; }
.admin-chat-file > span:nth-child(2),.admin-chat-selected-file > span:nth-child(2) { display: grid; min-width: 0; gap: 3px; }
.admin-chat-file strong,.admin-chat-selected-file strong { overflow: hidden; color: #e8eee5; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.admin-chat-file small,.admin-chat-selected-file small { color: #849182; font-size: 10px; }
.admin-chat-download { margin-left: auto; color: #a6d9af; font-size: 17px; }
.admin-chat-composer { padding: 13px 16px 10px; border-top: 1px solid rgba(146, 164, 143, .14); background: rgba(10, 16, 13, .72); }
.admin-chat-selected-file { display: flex; align-items: center; gap: 10px; max-width: 480px; margin: 0 0 10px 44px; padding: 8px; border: 1px solid rgba(255, 128, 61, .24); border-radius: 10px; background: rgba(255, 128, 61, .06); }
.admin-chat-selected-file > img { width: 44px; height: 44px; flex: 0 0 auto; border-radius: 7px; object-fit: cover; }
.admin-chat-selected-file button { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; margin-left: auto; border: 0; border-radius: 50%; background: transparent; color: #bac4b7; font-size: 20px; cursor: pointer; }
.admin-chat-selected-file button:hover { background: rgba(255, 255, 255, .08); color: white; }
.admin-chat-inline-error { margin: 0 0 9px 44px; color: #ff9b8a; font-size: 11px; }
.admin-chat-compose-row { display: flex; align-items: flex-end; gap: 9px; }
.admin-chat-file-input,.admin-chat-input-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
.admin-chat-attach,.admin-chat-send { display: grid; flex: 0 0 auto; width: 40px; height: 40px; place-items: center; border: 1px solid rgba(146, 164, 143, .2); border-radius: 11px; background: rgba(255, 255, 255, .035); color: #b6c2b2; font-size: 24px; cursor: pointer; }
.admin-chat-attach:hover:not(:disabled) { border-color: rgba(255, 128, 61, .65); color: #ff9a5c; }
.admin-chat-compose-row textarea { flex: 1; min-width: 0; min-height: 42px; max-height: 120px; resize: vertical; padding: 11px 12px; border: 1px solid rgba(146, 164, 143, .2); border-radius: 11px; outline: none; background: rgba(255, 255, 255, .035); color: #ecf1e9; font: 12px 'DM Sans', sans-serif; line-height: 1.5; }
.admin-chat-compose-row textarea:focus { border-color: rgba(255, 128, 61, .62); box-shadow: 0 0 0 3px rgba(255, 128, 61, .08); }
.admin-chat-compose-row textarea::placeholder { color: #768274; }
.admin-chat-send { border-color: #fa7d3b; background: linear-gradient(145deg, #ff9854, #ec622f); color: #21130d; font-size: 23px; font-weight: 900; box-shadow: 0 5px 16px rgba(242, 101, 48, .18); }
.admin-chat-send:hover:not(:disabled) { filter: brightness(1.1); }
.admin-chat-send:disabled,.admin-chat-attach:disabled { opacity: .45; cursor: not-allowed; }
.admin-chat-composer-foot { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0 0 49px; color: #728071; font: 9px 'DM Mono', monospace; letter-spacing: .02em; }
.admin-chat-error { display: grid; justify-items: center; gap: 9px; margin: auto; padding: 28px; color: #ffb6a8; text-align: center; }
.admin-chat-error span { color: #b9a29e; font-size: 12px; }
.admin-chat-error button { border: 0; background: none; color: #ff9a5c; font: 700 10px 'DM Mono', monospace; cursor: pointer; }
@media (max-width: 640px) {
  .admin-chat { gap: 13px; }
  .admin-chat-heading { align-items: flex-start; padding-top: 7px; }
  .admin-chat-heading p { font-size: 12px; }
  .admin-chat-live { padding: 7px 8px; font-size: 8px; }
  .admin-chat-panel { min-height: calc(100dvh - 240px); grid-template-rows: auto minmax(260px, 1fr) auto; }
  .admin-chat-messages { min-height: 260px; padding: 17px 12px; }
  .admin-chat-message { max-width: 97%; }
  .admin-chat-composer { padding: 10px; }
  .admin-chat-compose-row { gap: 6px; }
  .admin-chat-attach,.admin-chat-send { width: 36px; height: 38px; }
  .admin-chat-compose-row textarea { padding: 9px; }
  .admin-chat-composer-foot { margin-left: 0; font-size: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .admin-chat-spinner { animation: none; }
}
</style>
