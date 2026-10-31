<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ImagePlus, Link2, MessageCircle, Send, ShieldCheck, Sparkles, X } from '@lucide/vue'
import { communityChatAttachmentUrl, deleteCommunityChatMessage, editCommunityChatMessage, fetchCommunityChatMessages, sendCommunityChatMessage, uploadCommunityChatImage, type AdminChatMessage } from '../lib/api'

const props = defineProps<{ authToken: string }>()
const isOpen = ref(false)
const draft = ref('')
const loading = ref(true)
const sending = ref(false)
const errorMessage = ref('')
const messages = ref<AdminChatMessage[]>([])
const conversationElement = ref<HTMLElement | null>(null)
let refreshTimer: number | undefined
const selectedImage = ref<File | null>(null)
const imagePreview = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const editingId = ref('')
const editingText = ref('')
const clearedAt = ref(localStorage.getItem('cobra-community-cleared-at') || '')

function currentIdentityKey() {
  try {
    const payload = props.authToken.split('.')[1]
    return payload ? JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).sub : ''
  } catch {
    return ''
  }
}

function messageIsOwn(entry: AdminChatMessage) {
  return Boolean(props.authToken && entry.senderIdentityKey === currentIdentityKey())
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

async function scrollToLatest() {
  await nextTick()
  if (conversationElement.value) conversationElement.value.scrollTop = conversationElement.value.scrollHeight
}

async function loadMessages() {
  try {
    const loaded = await fetchCommunityChatMessages()
    messages.value = clearedAt.value
      ? loaded.filter((entry) => new Date(entry.createdAt).getTime() > new Date(clearedAt.value).getTime())
      : loaded
    errorMessage.value = ''
    await scrollToLatest()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load the community room.'
  } finally {
    loading.value = false
  }
}

async function sendMessage() {
  const message = draft.value.trim()
  if ((!message && !selectedImage.value) || !props.authToken || sending.value) return
  sending.value = true
  try {
    const sent = selectedImage.value
      ? await uploadCommunityChatImage(props.authToken, selectedImage.value, message)
      : await sendCommunityChatMessage(props.authToken, message)
    messages.value = [...messages.value, sent]
    draft.value = ''
    clearImage()
    await scrollToLatest()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not send your message.'
  } finally {
    sending.value = false
  }
}

function chooseImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    errorMessage.value = 'Choose a JPEG, PNG, WebP, or GIF image.'
    input.value = ''
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    errorMessage.value = 'Images must be 10 MB or smaller.'
    input.value = ''
    return
  }
  selectedImage.value = file
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imagePreview.value = URL.createObjectURL(file)
}

function clearImage() {
  selectedImage.value = null
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imagePreview.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

function messageLinks(message: string) {
  return [...message.matchAll(/https?:\/\/[^\s<]+/gi)].map((match) => match[0].replace(/[),.!?]+$/, ''))
}

function requestSignIn() {
  window.dispatchEvent(new Event('memescope:open-login'))
}

function beginEdit(entry: AdminChatMessage) {
  editingId.value = entry.id
  editingText.value = entry.deletedAt ? '' : entry.message
}

async function saveEdit(entry: AdminChatMessage) {
  const message = editingText.value.trim()
  if (!message || !props.authToken || editingId.value !== entry.id) return
  try {
    const updated = await editCommunityChatMessage(props.authToken, entry.id, message)
    const index = messages.value.findIndex((candidate) => candidate.id === entry.id)
    if (index >= 0) messages.value[index] = updated
    editingId.value = ''
    editingText.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not edit your message.'
  }
}

async function deleteMessage(entry: AdminChatMessage) {
  if (!props.authToken || !window.confirm('Delete this message?')) return
  try {
    await deleteCommunityChatMessage(props.authToken, entry.id)
    await loadMessages()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not delete your message.'
  }
}

function clearConversation() {
  if (!window.confirm('Clear this conversation from your view? Other users will keep it.')) return
  clearedAt.value = new Date().toISOString()
  localStorage.setItem('cobra-community-cleared-at', clearedAt.value)
  messages.value = []
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void sendMessage()
  }
}

onMounted(() => {
  void loadMessages()
  refreshTimer = window.setInterval(() => void loadMessages(), 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="community-chat">
    <button v-if="!isOpen" class="community-launcher" type="button" :aria-expanded="isOpen" aria-label="Open public community chat" @click="isOpen = true">
      <MessageCircle :size="19" />
      <span>Community Chat</span>
      <i></i>
    </button>

    <section v-if="isOpen" class="community-panel" aria-label="Public community chat">
      <header class="community-header">
        <div class="community-brand-icon"><Sparkles :size="18" /></div>
        <div class="community-heading">
          <strong>Cobra Community</strong>
          <span><i></i> PUBLIC CHAT ROOM</span>
        </div>
        <button class="community-clear" type="button" @click="clearConversation">Clear</button>
        <button class="community-close" type="button" aria-label="Close community chat" @click="isOpen = false"><X :size="18" /></button>
      </header>

      <div ref="conversationElement" class="community-conversation" aria-live="polite">
        <div class="room-introduction">
          <strong>Welcome to Cobra Community</strong>
          <p>Public conversation for members and Cobra staff.</p>
        </div>
        <p v-if="loading && !messages.length" class="room-status">Loading messages...</p>
        <article v-for="entry in messages" :key="entry.id" class="community-message" :class="{ 'message-own': messageIsOwn(entry) }">
          <div class="message-avatar">{{ entry.senderName.slice(0, 1).toUpperCase() }}</div>
          <div class="message-body">
            <div class="message-meta">
              <strong>{{ messageIsOwn(entry) ? 'You' : entry.senderName }}</strong>
              <span v-if="entry.senderRole === 'admin'" class="admin-badge"><ShieldCheck :size="11" /> ADMIN</span>
              <time>{{ formatTime(entry.createdAt) }}</time>
            </div>
            <form v-if="editingId === entry.id" class="community-message-edit" @submit.prevent="saveEdit(entry)">
              <input v-model="editingText" maxlength="2000" aria-label="Edit message" />
              <button type="submit">Save</button>
              <button type="button" @click="editingId = ''">Cancel</button>
            </form>
            <p v-else :class="{ 'message-deleted': entry.deletedAt }">{{ entry.deletedAt ? 'This message was deleted.' : entry.message }}</p>
            <span v-if="entry.editedAt && !entry.deletedAt" class="message-edited">edited</span>
            <img v-if="entry.attachmentContentType?.startsWith('image/')" class="community-attachment" :src="communityChatAttachmentUrl(entry.id)" :alt="entry.attachmentName || 'Community image'" />
            <div v-if="messageLinks(entry.message).length" class="community-links">
              <a v-for="link in messageLinks(entry.message)" :key="link" :href="link" target="_blank" rel="noopener noreferrer">
                <Link2 :size="12" /> {{ link }}
              </a>
            </div>
            <div v-if="messageIsOwn(entry) && !entry.deletedAt && editingId !== entry.id" class="message-actions">
              <button type="button" @click="beginEdit(entry)">Edit</button>
              <button type="button" @click="deleteMessage(entry)">Delete</button>
            </div>
          </div>
        </article>
        <p v-if="errorMessage" class="room-error" role="alert">{{ errorMessage }}</p>
      </div>

      <div v-if="!authToken" class="community-gate">
        <span>Join the conversation</span>
        <button type="button" @click="requestSignIn">Sign in to chat</button>
      </div>
      <form v-else class="community-composer" @submit.prevent="sendMessage">
        <input ref="fileInput" class="community-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" @change="chooseImage" />
        <button class="community-image-button" type="button" aria-label="Upload image" @click="fileInput?.click()"><ImagePlus :size="17" /></button>
        <input id="community-message" v-model="draft" maxlength="2000" autocomplete="off" aria-label="Message" :disabled="sending" @keydown="handleKeydown" />
        <button type="submit" aria-label="Send message" :disabled="sending || (!draft.trim() && !selectedImage)"><Send :size="17" /></button>
      </form>
      <div v-if="imagePreview" class="community-image-preview">
        <img :src="imagePreview" alt="Selected upload preview" />
        <button type="button" aria-label="Remove selected image" @click="clearImage"><X :size="14" /></button>
      </div>
      <p class="community-disclaimer">Be respectful. Never send passwords or wallet seed phrases.</p>
    </section>
  </div>
</template>

<style scoped>
.community-chat { position: fixed; z-index: 1200; right: max(22px, env(safe-area-inset-right)); bottom: max(22px, env(safe-area-inset-bottom)); display: grid; justify-items: end; font-family: 'DM Sans', sans-serif; }
.community-launcher { position: relative; display: inline-flex; min-height: 48px; align-items: center; gap: 9px; padding: 0 17px; border: 1px solid #8bffbe; border-radius: 999px; background: #7af7b3; color: #06211a; box-shadow: 0 8px 28px rgb(0 0 0 / 34%); font: 800 13px 'DM Sans', sans-serif; cursor: pointer; }
.community-launcher i { position: absolute; right: 3px; top: 3px; width: 8px; height: 8px; border: 2px solid #06211a; border-radius: 50%; background: #25dd80; }
.community-panel { display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; width: min(390px, calc(100vw - 32px)); height: min(570px, calc(100dvh - 100px)); overflow: hidden; border: 1px solid rgba(122,247,179,.28); border-radius: 18px; background: #071b20; color: #edf4f6; box-shadow: 0 22px 72px rgb(0 0 0 / 54%); }
.community-header { display: flex; align-items: center; gap: 11px; padding: 16px; border-bottom: 1px solid rgba(169,186,189,.16); background: linear-gradient(110deg,#102a2d,#0a1d22); }
.community-brand-icon { display: grid; width: 35px; height: 35px; place-items: center; border: 1px solid rgba(122,247,179,.38); border-radius: 11px; background: rgba(122,247,179,.1); color: #7af7b3; }
.community-heading { display: grid; flex: 1; gap: 4px; }
.community-heading strong { font-size: 14px; }
.community-heading span { display: flex; align-items: center; gap: 5px; color: #91adaf; font: 700 9px 'DM Mono', monospace; letter-spacing: .12em; }
.community-heading span i { width: 6px; height: 6px; border-radius: 50%; background: #4be59b; box-shadow: 0 0 8px #4be59b; }
.community-close { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid rgba(169,186,189,.2); border-radius: 50%; background: transparent; color: #d9e7e8; cursor: pointer; }
.community-clear { border: 0; background: transparent; color: #91aaa9; font-size: 11px; cursor: pointer; }
.community-clear:hover { color: #d9e7e8; }
.community-conversation { display: flex; min-height: 0; flex-direction: column; gap: 10px; overflow-y: auto; padding: 12px 14px 16px; }
.room-introduction { padding: 13px; border: 1px solid rgba(122,247,179,.16); border-radius: 12px; background: rgba(122,247,179,.055); }
.room-introduction strong { font-size: 13px; color: #b9ffd8; }
.room-introduction p, .room-status { margin: 4px 0 0; color: #91aaa9; font-size: 11px; }
.community-message { display: flex; align-items: flex-start; gap: 9px; max-width: 88%; }
.community-message.message-own { align-self: flex-end; flex-direction: row-reverse; }
.message-avatar { display: grid; flex: 0 0 30px; height: 30px; place-items: center; align-self: flex-end; margin-bottom: 2px; border-radius: 50%; background: #173b3b; color: #8fffc3; font-size: 12px; font-weight: 800; }
.message-body { min-width: 0; flex: 1; }
.message-meta { display: flex; align-items: center; gap: 7px; min-height: 18px; }
.message-meta strong { font-size: 11px; }
.message-meta time { margin-left: auto; color: #718b8b; font-size: 9px; }
.message-own .message-meta { justify-content: flex-end; }
.message-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 5px; }
.message-actions button, .community-message-edit button { border: 0; background: transparent; color: #91aaa9; font-size: 10px; cursor: pointer; }
.message-actions button:hover, .community-message-edit button:hover { color: #7af7b3; }
.community-message-edit { display: flex; gap: 5px; }
.community-message-edit input { min-width: 0; flex: 1; border: 1px solid rgba(122,247,179,.28); border-radius: 8px; background: #091719; color: #edf7f5; padding: 7px 8px; }
.message-edited { display: block; margin-top: 3px; color: #718b8b; font-size: 9px; }
.message-deleted { color: #718b8b !important; font-style: italic; }
.message-own .message-meta time { margin-left: 0; order: -1; }
.admin-badge { display: inline-flex; align-items: center; gap: 3px; color: #7af7b3; font: 800 8px 'DM Mono', monospace; }
.message-body p { margin: 3px 0 0; padding: 9px 11px; border-radius: 3px 12px 12px 12px; background: #102b30; color: #dae6e7; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.message-own .message-body p { border-radius: 12px 3px 12px 12px; background: #56351d; }
.community-composer { display: grid; grid-template-columns: 38px minmax(0,1fr) 38px; gap: 8px; margin: 8px 14px 0; align-items: center; }
.community-file-input { display: none; }
.community-image-button { grid-column: 1; }
.community-composer input:not(.community-file-input) { grid-column: 2; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.community-composer button[type='submit'] { grid-column: 3; }
.community-composer button { height: 40px; }
.community-image-preview { position: relative; width: 86px; margin: 8px 14px 0; }
.community-image-preview img { width: 86px; height: 86px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(122,247,179,.35); }
.community-image-preview button { position: absolute; right: -5px; top: -5px; display: grid; width: 22px; height: 22px; place-items: center; border: 0; border-radius: 50%; background: #dfffee; color: #06211a; cursor: pointer; }
.community-attachment { display: block; width: min(230px, 100%); max-height: 280px; margin-top: 7px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(169,186,189,.18); }
.community-links { display: grid; gap: 4px; margin-top: 7px; }
.community-links a { display: flex; align-items: center; gap: 5px; color: #7af7b3; font-size: 10px; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.community-composer input { min-width: 0; height: 40px; border: 1px solid rgba(169,186,189,.18); border-radius: 10px; outline: none; background: #0b2428; padding: 0 12px; color: #edf4f6; font: 12px 'DM Sans', sans-serif; }
.community-composer input:focus { border-color: rgba(122,247,179,.55); }
.community-composer button, .community-gate button { border: 0; border-radius: 10px; background: #7af7b3; color: #06211a; cursor: pointer; font-weight: 800; }
.community-gate { display: flex; align-items: center; justify-content: space-between; margin: 12px 14px 0; gap: 10px; }
.community-gate span { color: #a9bdbf; font-size: 11px; }
.community-gate button { min-height: 38px; padding: 0 12px; }
.community-disclaimer, .room-error { margin: 7px 14px 8px; color: #718b8b; font-size: 9px; text-align: center; }
.room-error { color: #ff9d9d; }
@media (max-width: 480px) { .community-chat { right: 12px; bottom: 12px; } .community-panel { width: calc(100vw - 24px); height: min(590px, calc(100dvh - 24px)); } }
@media (max-width: 480px) {
  .community-chat {
    right: max(8px, env(safe-area-inset-right));
    bottom: max(8px, env(safe-area-inset-bottom));
    left: max(8px, env(safe-area-inset-left));
  }
  .community-launcher { min-height: 44px; }
  .community-panel {
    width: 100%;
    height: min(640px, calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
    max-height: calc(100dvh - 16px);
    border-radius: 14px;
  }
  .community-header { padding: 12px 13px; }
  .community-conversation { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
  .community-composer { grid-template-columns: 44px minmax(0, 1fr) 44px; margin-inline: 10px; }
  .community-composer button, .community-close { min-width: 44px; min-height: 44px; }
  .community-composer input:not(.community-file-input) { height: 44px; font-size: 16px; }
  .community-message { max-width: 94%; }
  .message-actions button { min-height: 44px; padding-inline: 10px; }
  .community-image-preview, .community-image-preview img { width: 78px; height: 78px; }
}
</style>
