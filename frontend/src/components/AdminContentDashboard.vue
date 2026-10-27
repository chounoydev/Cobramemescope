<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  addStaffWallet,
  deleteLandingEvent,
  deleteStaffWallet,
  fetchAdminEvents,
  fetchAdminStaff,
  fetchSiteTheme,
  saveAdminEvent,
  saveAdminSiteTheme,
  uploadAdminEventImage,
  type LandingEvent,
  type SeasonalTheme,
  type StaffWallet,
} from '../lib/api'

const props = defineProps<{ token: string; role: 'owner' | 'staff' }>()
const emit = defineEmits<{ 'theme-updated': [theme: SeasonalTheme] }>()
type AdminContentSection = 'events' | 'appearance' | 'staff'

const events = ref<LandingEvent[]>([])
const staff = ref<StaffWallet[]>([])
const activeSection = ref<AdminContentSection>('events')
const siteTheme = ref<SeasonalTheme>('new-year')
const themeDraft = ref<SeasonalTheme>('new-year')
const editingId = ref<string | null>(null)
const loading = ref(true)
const databaseReady = ref(false)
const saving = ref(false)
const themeSaving = ref(false)
const error = ref('')
const notice = ref('')
const themeError = ref('')
const themeNotice = ref('')
const staffWallet = ref('')
const imageInput = ref<HTMLInputElement | null>(null)
const imageUploading = ref(false)
const eventForm = reactive({ badge: '', title: '', description: '', eventDate: '', cta: '', imageUrl: '' })
const themeOptions: { id: SeasonalTheme; label: string; description: string; icon: string }[] = [
  { id: 'none', label: 'Default', description: 'Keep the standard Cobra MemeScope background.', icon: '◐' },
  { id: 'christmas', label: 'Christmas · Santa Claus', description: 'A snowy Christmas village under the northern lights.', icon: '🎅' },
  { id: 'halloween', label: 'Halloween', description: 'A moonlit haunted-castle background with spooky accents.', icon: '🎃' },
  { id: 'new-year', label: 'New Year', description: 'Golden midnight fireworks and a celebratory skyline.', icon: '🎆' },
]
const previewEvents: LandingEvent[] = [
  { id: 'preview-launch-night', badge: 'LIVE EVENT', title: 'Cobra MemeScope Launch Night', description: 'Track the newest pairs, liquidity shifts, and risk signals before the next wave hits.', eventDate: 'Nov 14 · 6:30 PM', cta: 'Explore market pulse', imageUrl: '', displayOrder: 0 },
  { id: 'preview-alpha-brief', badge: 'COMMUNITY DROP', title: 'Solana alpha brief', description: 'Fresh token screening, holder risk snapshots, and launch desk intel for active communities.', eventDate: 'Nov 18 · 8:00 PM', cta: 'Join the briefing', imageUrl: '', displayOrder: 1 },
  { id: 'preview-contract-review', badge: 'RISK REPORT', title: 'Contract review masterclass', description: 'Learn how to read holder concentration, creator controls, and live liquidity risk at a glance.', eventDate: 'Nov 21 · 4:00 PM', cta: 'See the event', imageUrl: '', displayOrder: 2 },
]

function clearForm() {
  editingId.value = null
  Object.assign(eventForm, { badge: '', title: '', description: '', eventDate: '', cta: '', imageUrl: '' })
}

function editEvent(event: LandingEvent) {
  if (imageUploading.value) return
  editingId.value = event.id
  Object.assign(eventForm, event)
  error.value = ''
  notice.value = ''
  document.querySelector('.admin-event-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function uploadEventImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    error.value = 'Choose a JPEG, PNG, WebP, or GIF photo.'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Choose a photo smaller than 5 MB.'
    return
  }

  error.value = ''
  notice.value = ''
  imageUploading.value = true
  try {
    eventForm.imageUrl = await uploadAdminEventImage(props.token, file)
    notice.value = 'Photo uploaded. Publish the event to show it to visitors.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not upload the event photo.'
  } finally {
    imageUploading.value = false
  }
}

async function loadDashboard() {
  loading.value = true
  error.value = ''
  themeError.value = ''
  themeNotice.value = ''
  databaseReady.value = false
  try {
    const result = await fetchAdminEvents(props.token)
    events.value = result
    databaseReady.value = true
    if (props.role === 'owner') {
      try {
        siteTheme.value = await fetchSiteTheme()
        themeDraft.value = siteTheme.value
      } catch (cause) {
        themeError.value = cause instanceof Error ? cause.message : 'Could not load the site appearance.'
      }
    }
    if (props.role === 'owner') {
      try {
        staff.value = await fetchAdminStaff(props.token)
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : 'Could not load the staff list.'
      }
    }
  } catch (cause) {
    events.value = previewEvents.map((event) => ({ ...event }))
    error.value = cause instanceof Error ? cause.message : 'Could not load the private editor.'
  } finally {
    loading.value = false
  }
}

async function saveTheme() {
  if (props.role !== 'owner' || !databaseReady.value || themeSaving.value) return
  themeError.value = ''
  themeNotice.value = ''
  themeSaving.value = true
  try {
    siteTheme.value = await saveAdminSiteTheme(props.token, themeDraft.value)
    themeDraft.value = siteTheme.value
    emit('theme-updated', siteTheme.value)
    themeNotice.value = 'Site appearance updated for all visitors.'
  } catch (cause) {
    themeError.value = cause instanceof Error ? cause.message : 'Could not save the site appearance.'
  } finally {
    themeSaving.value = false
  }
}

async function saveEvent() {
  if (!databaseReady.value) return
  error.value = ''
  notice.value = ''
  if (!eventForm.badge.trim() || !eventForm.title.trim() || !eventForm.description.trim() || !eventForm.cta.trim()) {
    error.value = 'Badge, title, description, and button text are required.'
    return
  }
  saving.value = true
  try {
    const saved = await saveAdminEvent(props.token, { ...eventForm }, editingId.value)
    const index = events.value.findIndex((event) => event.id === saved.id)
    if (index < 0) events.value.push(saved)
    else events.value[index] = saved
    events.value.sort((left, right) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id))
    clearForm()
    notice.value = 'Event saved. The public landing page now uses this content.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not save the event.'
  } finally {
    saving.value = false
  }
}

async function removeEvent(event: LandingEvent) {
  if (!databaseReady.value) return
  if (!window.confirm(`Delete “${event.title}”? This removes it from the landing page.`)) return
  error.value = ''
  notice.value = ''
  try {
    await deleteLandingEvent(props.token, event.id)
    events.value = events.value.filter((item) => item.id !== event.id)
    if (editingId.value === event.id) clearForm()
    notice.value = 'Event deleted.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not delete the event.'
  }
}

async function grantStaffAccess() {
  if (!databaseReady.value) return
  error.value = ''
  notice.value = ''
  try {
    const added = await addStaffWallet(props.token, staffWallet.value.trim())
    staff.value.push(added)
    staffWallet.value = ''
    notice.value = 'Staff wallet added. It can sign in with that Solana wallet to edit events.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not add the staff wallet.'
  }
}

async function revokeStaffAccess(member: StaffWallet) {
  if (!databaseReady.value) return
  if (!window.confirm(`Remove staff access for ${member.walletAddress}?`)) return
  error.value = ''
  try {
    await deleteStaffWallet(props.token, member.walletAddress)
    staff.value = staff.value.filter((item) => item.walletAddress !== member.walletAddress)
    notice.value = 'Staff access removed.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not remove staff access.'
  }
}

function shortAddress(address: string) {
  return `${address.slice(0, 7)}…${address.slice(-6)}`
}

onMounted(() => { void loadDashboard() })
</script>

<template>
  <section class="admin-content-page" aria-labelledby="content-admin-title">
    <header class="admin-content-head">
      <div>
        <div class="admin-content-eyebrow"><span></span> PRIVATE CONSOLE <b>/</b> {{ role === 'owner' ? 'OWNER' : 'STAFF' }}</div>
        <h1 id="content-admin-title">Admin workspace<em>.</em></h1>
        <p>Manage public content, site appearance, and editor access.</p>
      </div>
      <button type="button" class="admin-refresh" :disabled="loading" aria-label="Refresh dashboard data" @click="loadDashboard">↻</button>
    </header>

    <div v-if="error" class="admin-message admin-error" role="alert"><strong>{{ databaseReady ? 'Could not complete that action' : 'Showing preview: database unavailable' }}</strong><span>{{ error }}</span></div>
    <div v-if="notice" class="admin-message admin-notice" role="status">{{ notice }}</div>
    <div v-if="loading" class="admin-loading" role="status"><span class="scan-spinner"></span>Loading saved events…</div>
    <template v-else>
      <nav class="admin-content-nav" aria-label="Admin workspace sections">
        <button type="button" :class="{ active: activeSection === 'events' }" :aria-current="activeSection === 'events' ? 'page' : undefined" @click="activeSection = 'events'"><span>01</span> Events & content</button>
        <button v-if="role === 'owner'" type="button" :class="{ active: activeSection === 'appearance' }" :aria-current="activeSection === 'appearance' ? 'page' : undefined" @click="activeSection = 'appearance'"><span>02</span> Site appearance</button>
        <button v-if="role === 'owner'" type="button" :class="{ active: activeSection === 'staff' }" :aria-current="activeSection === 'staff' ? 'page' : undefined" @click="activeSection = 'staff'"><span>03</span> Staff access</button>
      </nav>

      <section v-if="activeSection === 'events'" class="admin-content-layout" aria-label="Landing page content">
        <section class="admin-event-list" aria-labelledby="event-list-title">
          <div class="admin-section-head"><div><span>{{ databaseReady ? 'PUBLIC LANDING PAGE' : 'BUILT-IN PUBLIC EVENTS · PREVIEW ONLY' }}</span><h2 id="event-list-title">Events <small>{{ events.length }}</small></h2></div><button type="button" class="admin-primary" :disabled="!databaseReady || imageUploading" @click="clearForm">+ NEW EVENT</button></div>
          <article v-for="(event, index) in events" :key="event.id" class="admin-event-row">
            <img v-if="event.imageUrl" :src="event.imageUrl" alt="" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
            <span v-else class="admin-event-placeholder">0{{ index + 1 }}</span>
            <div class="admin-event-copy"><span>{{ event.badge }}<template v-if="event.eventDate"> · {{ event.eventDate }}</template></span><strong>{{ event.title }}</strong><small>{{ event.description }}</small></div>
            <div class="admin-row-actions"><button type="button" :disabled="!databaseReady || imageUploading" :aria-label="`Edit ${event.title}`" @click="editEvent(event)">EDIT</button><button type="button" class="admin-delete" :disabled="!databaseReady || imageUploading" :aria-label="`Delete ${event.title}`" @click="removeEvent(event)">DELETE</button></div>
          </article>
          <div v-if="events.length === 0" class="admin-empty">No events have been published yet.</div>
        </section>

        <form class="admin-event-form" @submit.prevent="saveEvent">
          <div class="admin-section-head"><div><span>{{ editingId ? 'UPDATE PUBLISHED EVENT' : 'CREATE CONTENT' }}</span><h2>{{ editingId ? 'Edit event' : 'New event' }}</h2></div><button v-if="editingId" type="button" class="admin-cancel" @click="clearForm">CANCEL</button></div>
          <label>Badge<input v-model="eventForm.badge" maxlength="60" required placeholder="LIVE EVENT" /></label>
          <label>Title<input v-model="eventForm.title" maxlength="140" required placeholder="Event title" /></label>
          <label>Description<textarea v-model="eventForm.description" maxlength="1000" rows="4" required placeholder="Describe the event" /></label>
          <div class="admin-form-pair"><label>Date / time<input v-model="eventForm.eventDate" maxlength="100" placeholder="Nov 14 · 6:30 PM" /></label><label>Button text<input v-model="eventForm.cta" maxlength="80" required placeholder="Explore event" /></label></div>
          <div class="admin-image-picker">
            <span class="admin-image-label">Event photo <small>Choose a photo from your device. JPEG, PNG, WebP, or GIF · up to 5 MB.</small></span>
            <input ref="imageInput" class="admin-image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Choose an event photo from your device" :disabled="!databaseReady || imageUploading" @change="uploadEventImage" />
            <button type="button" class="admin-image-choose" :disabled="!databaseReady || imageUploading" @click="imageInput?.click()">{{ imageUploading ? 'UPLOADING PHOTO…' : eventForm.imageUrl ? 'CHANGE PHOTO' : 'CHOOSE FROM GALLERY' }}</button>
            <img v-if="eventForm.imageUrl" class="admin-image-preview" :src="eventForm.imageUrl" alt="Selected event photo preview" />
            <button v-if="eventForm.imageUrl" type="button" class="admin-image-remove" :disabled="imageUploading" @click="eventForm.imageUrl = ''">REMOVE PHOTO</button>
          </div>
          <button type="submit" class="admin-primary admin-save" :disabled="saving || imageUploading || !databaseReady">{{ !databaseReady ? 'DATABASE REQUIRED' : imageUploading ? 'UPLOADING PHOTO…' : saving ? 'SAVING…' : editingId ? 'SAVE CHANGES' : 'PUBLISH EVENT' }}</button>
        </form>
      </section>

      <section v-if="role === 'owner' && activeSection === 'appearance'" class="admin-theme-panel" aria-labelledby="admin-theme-title">
        <div class="admin-section-head">
          <div><span>PUBLIC SITE · ALL VISITORS</span><h2 id="admin-theme-title">Seasonal background</h2></div>
          <button type="button" class="admin-primary" :disabled="!databaseReady || themeSaving || themeDraft === siteTheme" @click="saveTheme">
            {{ !databaseReady ? 'DATABASE REQUIRED' : themeSaving ? 'PUBLISHING…' : 'PUBLISH THEME' }}
          </button>
        </div>
        <p class="admin-theme-description">Choose the background shown to everyone. Changes are saved centrally and apply across devices.</p>
        <div class="admin-theme-options" role="group" aria-label="Choose the public seasonal background">
          <button
            v-for="option in themeOptions"
            :key="option.id"
            type="button"
            class="admin-theme-option"
            :class="[`admin-theme-option-${option.id}`, { selected: themeDraft === option.id }]"
            :aria-pressed="themeDraft === option.id"
            :disabled="!databaseReady || themeSaving"
            @click="themeDraft = option.id; themeError = ''; themeNotice = ''"
          >
            <span class="admin-theme-icon" aria-hidden="true">{{ option.icon }}</span>
            <span class="admin-theme-copy"><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
            <span class="admin-theme-check" aria-hidden="true">{{ themeDraft === option.id ? '✓' : '' }}</span>
          </button>
        </div>
        <p v-if="themeError" class="admin-theme-message admin-theme-error" role="alert">{{ themeError }}</p>
        <p v-else-if="themeNotice" class="admin-theme-message admin-theme-notice" role="status">{{ themeNotice }}</p>
      </section>

      <section v-if="role === 'owner' && activeSection === 'staff'" class="admin-staff-section" aria-labelledby="staff-title">
        <div class="admin-section-head"><div><span>DEVELOPER WALLET ONLY</span><h2 id="staff-title">Staff access <small>{{ staff.length }}</small></h2></div></div>
        <p class="admin-staff-note">Staff can edit landing events but cannot manage wallets or access donor analytics. They must sign in with the wallet address added here.</p>
        <form class="admin-staff-form" @submit.prevent="grantStaffAccess"><label for="staff-wallet">Solana wallet address</label><input id="staff-wallet" v-model="staffWallet" :disabled="!databaseReady" required spellcheck="false" placeholder="Paste a staff wallet address" /><button type="submit" class="admin-primary" :disabled="!databaseReady">GRANT EDITOR ACCESS</button></form>
        <div v-for="member in staff" :key="member.walletAddress" class="admin-staff-row"><code :title="member.walletAddress">{{ shortAddress(member.walletAddress) }}</code><small>EDITOR</small><button type="button" class="admin-row-actions admin-delete" :disabled="!databaseReady" @click="revokeStaffAccess(member)">REMOVE ACCESS</button></div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.admin-content-nav { display: flex; flex-wrap: wrap; gap: 7px; margin: 20px 0 16px; padding: 5px; border: 1px solid #dce0d7; background: #e9ede5; }
.admin-content-nav button { display: inline-flex; min-height: 38px; align-items: center; gap: 9px; padding: 0 13px; border: 1px solid transparent; background: transparent; color: #64705e; font: 600 10px 'DM Sans', sans-serif; cursor: pointer; }
.admin-content-nav button > span { color: #87917f; font: 8px 'DM Mono', monospace; }
.admin-content-nav button:hover { color: #293526; }
.admin-content-nav button.active { border-color: #d7ddce; background: #fff; color: #283426; box-shadow: 0 1px 2px rgb(26 39 22 / 7%); }
.admin-content-nav button.active > span { color: #708741; }
.admin-theme-panel { margin-top: 18px; }
.admin-theme-description { margin: 12px 14px; color: #70796d; font-size: 10px; line-height: 1.5; }
.admin-theme-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; padding: 0 14px 14px; }
.admin-image-picker { display: grid; gap: 8px; padding: 0 14px; }
.admin-image-label { display: grid; gap: 5px; color: #5d6757; font: 8px 'DM Mono', monospace; }
.admin-image-label small { color: #8a9186; font: 8px 'DM Sans', sans-serif; line-height: 1.5; }
.admin-image-input { display: none; }
.admin-image-choose,.admin-image-remove { min-height: 34px; padding: 0 11px; border: 1px solid #dce0d7; background: #f8faf6; color: #56604f; font: 8px 'DM Mono', monospace; cursor: pointer; }
.admin-image-choose { justify-self: start; }
.admin-image-remove { justify-self: start; color: #9b473d; }
.admin-image-choose:hover,.admin-image-remove:hover { border-color: #9aa782; }
.admin-image-choose:disabled,.admin-image-remove:disabled { cursor: not-allowed; opacity: .6; }
.admin-image-preview { width: 100%; max-height: 240px; border: 1px solid #dce0d7; background: #f2f4ef; object-fit: contain; }
.admin-theme-option { display: grid; min-width: 0; min-height: 82px; grid-template-columns: 35px minmax(0, 1fr) 18px; align-items: center; gap: 10px; padding: 10px; border: 1px solid #dce0d7; background: #f8faf6; color: #30382e; text-align: left; cursor: pointer; }
.admin-theme-option:hover { border-color: #9aa782; }
.admin-theme-option.selected { border-color: #809443; box-shadow: inset 0 0 0 1px #809443; }
.admin-theme-option:disabled { cursor: not-allowed; opacity: .6; }
.admin-theme-icon { display: grid; width: 35px; height: 35px; place-items: center; border: 1px solid #e1e5db; background: #eef2e8; font-size: 18px; }
.admin-theme-option-christmas .admin-theme-icon { background: linear-gradient(145deg, #dcecf4, #eff4f4); }
.admin-theme-option-halloween .admin-theme-icon { background: linear-gradient(145deg, #38263e, #8b451f); }
.admin-theme-option-new-year .admin-theme-icon { background: linear-gradient(145deg, #121d3b, #72502a); }
.admin-theme-copy { display: grid; min-width: 0; gap: 4px; }
.admin-theme-copy strong { font-size: 10px; }
.admin-theme-copy small { color: #70796d; font-size: 8px; line-height: 1.4; }
.admin-theme-check { display: grid; width: 18px; height: 18px; place-items: center; border: 1px solid #aeb6a5; border-radius: 50%; color: #547638; font-size: 11px; }
.admin-theme-message { margin: 0 14px 14px; font-size: 9px; line-height: 1.5; }
.admin-theme-error { color: #9b4137; }
.admin-theme-notice { color: #52713e; }
.admin-content-page { max-width: 1160px; margin: 0 auto; padding: 37px 0 24px; }.admin-content-head { display: flex; align-items: end; justify-content: space-between; gap: 18px; padding-bottom: 22px; border-bottom: 1px solid #d9ddd4; }.admin-content-eyebrow { display: flex; align-items: center; gap: 8px; color: #737c6f; font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: .9px; }.admin-content-eyebrow > span { width: 8px; height: 8px; border-radius: 50%; background: #d9ef6e; }.admin-content-eyebrow b { color: #adb3a8; font-weight: 400; }.admin-content-head h1 { margin-top: 12px; color: #20261e; font-family: Manrope, sans-serif; font-size: 34px; font-weight: 800; }.admin-content-head h1 em { color: #879744; font-style: normal; }.admin-content-head p { margin-top: 7px; color: #7d8579; font-size: 10px; }.admin-refresh { width: 32px; height: 32px; border: 1px solid #dce0d7; background: #fff; color: #606b5a; font-size: 17px; }.admin-content-layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr); gap: 16px; margin-top: 18px; align-items: start; }.admin-event-list,.admin-event-form,.admin-staff-section,.admin-theme-panel { min-width: 0; border: 1px solid #dce0d7; background: #fff; }.admin-section-head { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; border-bottom: 1px solid #e5e8e1; }.admin-section-head > div > span { color: #81897d; font-family: 'DM Mono', monospace; font-size: 7px; letter-spacing: .6px; }.admin-section-head h2 { margin-top: 4px; color: #30382e; font-family: Manrope, sans-serif; font-size: 14px; }.admin-section-head h2 small { margin-left: 5px; color: #828a7e; font: 9px 'DM Mono', monospace; }.admin-primary { min-height: 31px; padding: 0 10px; background: #273126; color: #f4f6ed; font: 8px 'DM Mono', monospace; }.admin-primary:hover { background: #394734; }.admin-primary:disabled { opacity: .6; }.admin-event-row { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 11px 13px; border-bottom: 1px solid #eef0eb; }.admin-event-row:last-of-type { border-bottom: 0; }.admin-event-row > img,.admin-event-placeholder { display: grid; width: 54px; height: 54px; place-items: center; background: #edf2df; color: #607149; object-fit: cover; font: 11px Manrope, sans-serif; }.admin-event-copy { display: grid; min-width: 0; gap: 4px; }.admin-event-copy > span { color: #81897d; font: 7px 'DM Mono', monospace; }.admin-event-copy > strong { overflow: hidden; color: #30382e; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.admin-event-copy > small { display: -webkit-box; overflow: hidden; color: #828a7e; font-size: 8px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.admin-row-actions { display: flex; gap: 5px; }.admin-row-actions button,.admin-cancel { min-height: 27px; padding: 0 7px; border: 1px solid #dce0d7; background: #fff; color: #56604f; font: 7px 'DM Mono', monospace; }.admin-row-actions .admin-delete,.admin-staff-row .admin-delete { color: #9b473d; }.admin-empty { padding: 24px 16px; color: #848b80; font-size: 9px; }.admin-event-form { display: grid; gap: 12px; padding-bottom: 14px; scroll-margin-top: 20px; }.admin-event-form > label,.admin-form-pair label { display: grid; gap: 5px; padding: 0 14px; color: #5d6757; font: 8px 'DM Mono', monospace; }.admin-event-form input,.admin-event-form textarea,.admin-staff-form input { width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid #dce0d7; outline: 0; background: #fbfcf9; color: #313a2f; font: 10px 'DM Sans', sans-serif; }.admin-event-form textarea { resize: vertical; line-height: 1.5; }.admin-event-form input:focus,.admin-event-form textarea:focus,.admin-staff-form input:focus { border-color: #859743; box-shadow: 0 0 0 2px rgb(219 244 106 / 24%); }.admin-event-form label > small { color: #8a9186; font: 8px 'DM Sans', sans-serif; }.admin-form-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.admin-image-preview { width: calc(100% - 28px); max-height: 150px; justify-self: center; object-fit: cover; }.admin-save { margin: 0 14px; }.admin-message { display: grid; gap: 5px; margin-top: 12px; padding: 11px 13px; font-size: 9px; }.admin-error { border: 1px solid #e7c7c0; background: #fbefec; color: #813a31; }.admin-error span { color: #8d5149; }.admin-notice { border: 1px solid #d3dfc4; background: #f2f7e9; color: #526943; }.admin-loading { display: flex; align-items: center; gap: 10px; padding: 25px 0; color: #6f786a; font-size: 10px; }.admin-staff-section { margin-top: 16px; }.admin-staff-note { padding: 11px 14px 0; color: #7d8579; font-size: 9px; line-height: 1.5; }.admin-staff-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; padding: 12px 14px; }.admin-staff-form label { grid-column: 1 / -1; color: #5d6757; font: 8px 'DM Mono', monospace; }.admin-staff-form input { height: 33px; }.admin-staff-row { display: grid; grid-template-columns: minmax(0, 1fr) 60px auto; align-items: center; gap: 12px; padding: 9px 14px; border-top: 1px solid #eef0eb; }.admin-staff-row code { overflow: hidden; color: #56604f; font-size: 9px; text-overflow: ellipsis; }.admin-staff-row > small { color: #7d8579; font: 7px 'DM Mono', monospace; }.admin-staff-row .admin-row-actions { min-height: 27px; border: 1px solid #dce0d7; background: #fff; color: #9b473d; font: 7px 'DM Mono', monospace; }
@media (max-width: 900px) { .admin-content-layout { grid-template-columns: 1fr; } }
@media (max-width: 650px) { .admin-content-page { padding-top: 24px; }.admin-content-head h1 { font-size: 27px; }.admin-content-head p { max-width: 270px; line-height: 1.5; }.admin-event-row { grid-template-columns: 42px minmax(0, 1fr); }.admin-event-row > img,.admin-event-placeholder { width: 42px; height: 42px; }.admin-event-row .admin-row-actions { grid-column: 2; }.admin-form-pair { grid-template-columns: 1fr; }.admin-staff-form { grid-template-columns: 1fr; }.admin-staff-form label { grid-column: 1; }.admin-staff-row { grid-template-columns: minmax(0, 1fr) auto; }.admin-staff-row > small { display: none; }.admin-staff-row .admin-row-actions { grid-column: 2; } }
@media (max-width: 540px) { .admin-theme-options { grid-template-columns: 1fr; }.admin-theme-panel > .admin-section-head { align-items: flex-start; flex-direction: column; }.admin-theme-panel > .admin-section-head .admin-primary { width: 100%; } }
</style>
