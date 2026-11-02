<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
  deleteUser,
} from 'firebase/auth'
import { auth } from '../firebase'
import { deleteAccount, errorText } from '../services/api'
import { deleteMany } from '../services/storage'
import { useProfileStore } from '../stores/profile'
import { useOffersStore } from '../stores/offers'
import { useBookingsStore } from '../stores/bookings'
import { useToastStore } from '../stores/toast'

// The "Edit profile" popup: one long scrolling form, with tabs on the left
// that jump to each part and light up as you scroll past it.
const emit = defineEmits(['close'])

const router = useRouter()
const store = useProfileStore()
const toast = useToastStore()

// ---------- The tabs ----------
const sections = [
  { id: 'profile', label: 'Profile' },
  { id: 'skills', label: 'Skills' },
  { id: 'email', label: 'Email' },
  { id: 'password', label: 'Password' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'delete', label: 'Delete account' },
]
const activeSection = ref('profile')
const scrollBox = ref(null)
let ignoreScrollUntil = 0 // while a tab click is scrolling, don't let the highlight jump around

function jumpTo(id) {
  const target = scrollBox.value.querySelector('#edit-' + id)
  activeSection.value = id
  ignoreScrollUntil = Date.now() + 800
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  scrollBox.value.scrollTo({ top: target.offsetTop - 12, behavior: reduceMotion ? 'auto' : 'smooth' })
}

// light up the tab of the part that is at the top of the scroll box
function onScroll() {
  if (Date.now() < ignoreScrollUntil) return
  const box = scrollBox.value
  let current = sections[0].id
  for (const s of sections) {
    const part = box.querySelector('#edit-' + s.id)
    if (part.offsetTop - box.scrollTop <= 60) current = s.id
  }
  activeSection.value = current
}

// ---------- Profile and privacy (saved together by the button at the bottom) ----------
function copyOfProfile() {
  const p = store.profile
  return {
    name: p.name || '',
    bio: p.bio || '',
    region: p.region || '',
    photo: p.photo || '',
    showRegion: p.showRegion !== false, // shown unless they turned it off
  }
}

// the form works on a copy, so closing without saving leaves the real profile untouched
const draft = reactive(copyOfProfile())
const saved = ref(JSON.stringify(draft))
const hasChanges = computed(() => JSON.stringify(draft) !== saved.value)
const formError = ref('')

async function save() {
  formError.value = ''

  // quick checks so people get instant feedback (the server checks again)
  const name = draft.name.trim()
  if (name === '') {
    formError.value = 'Please enter your name.'
    jumpTo('profile')
    return
  }
  if (name.length > 60) {
    formError.value = 'Your name must be 60 characters or fewer.'
    jumpTo('profile')
    return
  }

  const ok = await store.saveProfile({
    name: name,
    bio: draft.bio.trim(),
    region: draft.region,
    photo: draft.photo,
    showRegion: draft.showRegion,
  })

  if (ok) {
    Object.assign(draft, copyOfProfile())
    saved.value = JSON.stringify(draft)
    toast.show('Profile saved.')
  } else {
    formError.value = store.saveError
  }
}

function undoChanges() {
  Object.assign(draft, JSON.parse(saved.value))
  formError.value = ''
}

// ---------- Photo ----------
const photoInput = ref(null)
const photoError = ref('')

const initials = computed(() => {
  const words = draft.name.trim().split(' ').filter((w) => w !== '')
  if (words.length === 0) return '?'
  let letters = words[0][0]
  if (words.length > 1) letters += words[words.length - 1][0]
  return letters.toUpperCase()
})

// Shrink the picture to a 160px square, so it is small enough to keep in the profile
function pickPhoto(event) {
  const file = event.target.files[0]
  event.target.value = '' // so picking the same file again still works
  photoError.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    photoError.value = 'Please choose a picture.'
    return
  }

  const img = new Image()
  img.onload = () => {
    const size = 160
    const side = Math.min(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const left = (img.width - side) / 2
    const top = (img.height - side) / 2
    canvas.getContext('2d').drawImage(img, left, top, side, side, 0, 0, size, size)
    draft.photo = canvas.toDataURL('image/jpeg', 0.85)
    URL.revokeObjectURL(img.src)
  }
  img.onerror = () => {
    photoError.value = 'That picture could not be opened.'
  }
  img.src = URL.createObjectURL(file)
}

// ---------- Skills (edited on their own pages) ----------
function skillsOf(field) {
  return store.profile[field] || []
}

function goTo(path) {
  if (!confirmLeave()) return
  emit('close')
  router.push(path)
}

// ---------- Firebase errors in plain words ----------
function loginErrorText(err) {
  const messages = {
    'auth/wrong-password': 'Your current password is incorrect.',
    'auth/invalid-credential': 'Your current password is incorrect.',
    'auth/missing-password': 'Please enter your current password.',
    'auth/too-many-requests': 'Too many tries. Please wait a moment and try again.',
    'auth/weak-password': 'That password is too weak.',
    'auth/email-already-in-use': 'Another account already uses that email.',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/requires-recent-login': 'Please log out and log in again, then try again.',
  }
  return messages[err.code] || 'Something went wrong: ' + (err.code || err.message)
}

// Firebase asks for the password again before changing the email or password
async function checkPassword(password) {
  const credential = EmailAuthProvider.credential(auth.currentUser.email, password)
  await reauthenticateWithCredential(auth.currentUser, credential)
}

// ---------- Email ----------
const emailForm = reactive({ newEmail: '', password: '', busy: false, message: '', isError: false })

async function changeEmail() {
  emailForm.message = ''
  const newEmail = emailForm.newEmail.trim()
  if (newEmail.toLowerCase() === (auth.currentUser.email || '').toLowerCase()) {
    emailForm.isError = true
    emailForm.message = 'That is already your email.'
    return
  }

  emailForm.busy = true
  try {
    await checkPassword(emailForm.password)
    await verifyBeforeUpdateEmail(auth.currentUser, newEmail)
    emailForm.isError = false
    emailForm.message = 'We sent a link to ' + newEmail + '. Your email changes once you click it.'
    emailForm.newEmail = ''
    emailForm.password = ''
  } catch (err) {
    emailForm.isError = true
    emailForm.message = loginErrorText(err)
  }
  emailForm.busy = false
}

// ---------- Password ----------
const pwForm = reactive({
  current: '', next: '', repeat: '', show: false, busy: false, message: '', isError: false,
})

const strength = computed(() => {
  const pw = pwForm.next
  if (pw === '') return null
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Weak', percent: 25, colour: 'bg-danger' }
  if (score === 2) return { label: 'Fair', percent: 50, colour: 'bg-warning' }
  if (score === 3) return { label: 'Good', percent: 75, colour: 'bg-info' }
  return { label: 'Strong', percent: 100, colour: 'bg-success' }
})

const pwProblem = computed(() => {
  if (pwForm.next !== '' && pwForm.next.length < 8) return 'Use at least 8 characters.'
  if (pwForm.repeat !== '' && pwForm.next !== pwForm.repeat) return 'The new passwords do not match.'
  if (pwForm.next !== '' && pwForm.next === pwForm.current) return 'Pick a password different from your current one.'
  return ''
})

async function changePassword() {
  pwForm.message = ''
  if (pwProblem.value !== '') return

  pwForm.busy = true
  try {
    await checkPassword(pwForm.current)
    await updatePassword(auth.currentUser, pwForm.next)
    pwForm.isError = false
    pwForm.message = 'Password updated.'
    pwForm.current = ''
    pwForm.next = ''
    pwForm.repeat = ''
  } catch (err) {
    pwForm.isError = true
    pwForm.message = loginErrorText(err)
  }
  pwForm.busy = false
}

// ---------- Delete account ----------
const deleteForm = reactive({ typed: '', password: '', busy: false, message: '' })

async function removeAccount() {
  deleteForm.message = ''
  deleteForm.busy = true
  try {
    await checkPassword(deleteForm.password)
  } catch (err) {
    deleteForm.message = loginErrorText(err)
    deleteForm.busy = false
    return
  }

  try {
    const result = await deleteAccount() // the server says no if a session is still running
    await deleteMany(result.removedPaths)
    await deleteUser(auth.currentUser)
  } catch (err) {
    deleteForm.message = err.code ? loginErrorText(err) : errorText(err)
    deleteForm.busy = false
    return
  }

  // forget everything about this person, like logging out does
  store.reset()
  useOffersStore().reset()
  useBookingsStore().reset()
  emit('close')
  router.push('/login')
}

// ---------- Closing ----------
function confirmLeave() {
  return !hasChanges.value || confirm('You have unsaved changes. Leave without saving?')
}

function close() {
  if (confirmLeave()) emit('close')
}

function onKey(event) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden' // stop the page behind from scrolling
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="modal-overlay" @click.self="close">
    <section class="k-card edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <header class="edit-header d-flex justify-content-between align-items-center px-4 py-3">
        <h2 id="edit-title" class="h4 mb-0">Edit profile</h2>
        <button type="button" class="btn-close" aria-label="Close" @click="close"></button>
      </header>

      <div class="edit-body">
        <!-- a column on a computer, a strip along the top on a phone -->
        <nav class="tabs" aria-label="Parts of your profile">
          <button
            v-for="s in sections"
            :key="s.id"
            type="button"
            class="tab"
            :class="{ active: activeSection === s.id, 'tab-delete': s.id === 'delete' }"
            :aria-current="activeSection === s.id ? 'true' : null"
            @click="jumpTo(s.id)"
          >
            {{ s.label }}
          </button>
        </nav>

        <div ref="scrollBox" class="scroll-box" @scroll.passive="onScroll">
          <!-- Profile -->
          <section id="edit-profile" class="part">
            <p class="eyebrow mb-1">WHAT OTHERS SEE</p>
            <h3 class="h5 mb-3">Profile</h3>

            <div class="d-flex align-items-center gap-3 mb-3">
              <img v-if="draft.photo" :src="draft.photo" alt="Your profile photo" class="photo" />
              <div v-else class="photo photo-empty" aria-hidden="true">{{ initials }}</div>
              <div>
                <button type="button" class="btn btn-sm btn-outline-secondary me-2" @click="photoInput.click()">
                  {{ draft.photo ? 'Change photo' : 'Upload photo' }}
                </button>
                <button
                  v-if="draft.photo"
                  type="button"
                  class="btn btn-sm btn-link text-danger p-0"
                  @click="draft.photo = ''"
                >
                  Remove
                </button>
                <input ref="photoInput" type="file" accept="image/*" class="d-none" @change="pickPhoto" />
                <small v-if="photoError" class="d-block text-danger mt-1">{{ photoError }}</small>
              </div>
            </div>

            <div class="mb-3">
              <label for="edit-name" class="form-label">Display name</label>
              <input id="edit-name" v-model="draft.name" type="text" class="form-control" maxlength="60" required />
            </div>

            <div class="mb-3">
              <label for="edit-bio" class="form-label">About me</label>
              <textarea
                id="edit-bio"
                v-model="draft.bio"
                class="form-control"
                rows="4"
                maxlength="300"
                placeholder="What do you love teaching? What are you hoping to learn?"
              ></textarea>
              <small class="text-muted">{{ draft.bio.length }}/300</small>
            </div>

            <div>
              <label for="edit-region" class="form-label">Region</label>
              <select id="edit-region" v-model="draft.region" class="form-select">
                <option value="">Prefer not to say</option>
                <option v-for="r in store.regions" :key="r" :value="r">{{ r }}</option>
              </select>
              <small class="text-muted">Only your region is shown, never your address.</small>
            </div>
          </section>

          <!-- Skills -->
          <section id="edit-skills" class="part">
            <p class="eyebrow mb-1">TEACH AND LEARN</p>
            <h3 class="h5 mb-3">Skills</h3>

            <div class="row g-3">
              <div class="col-12 col-md-6">
                <h4 class="h6">Skills I can teach</h4>
                <div class="chips mb-2">
                  <span v-for="skill in skillsOf('skillsTeach')" :key="skill.name" class="chip">{{ skill.name }}</span>
                  <small v-if="skillsOf('skillsTeach').length === 0" class="text-muted">None yet.</small>
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="goTo('/skills/teach')">
                  Manage teaching skills
                </button>
              </div>
              <div class="col-12 col-md-6">
                <h4 class="h6">Skills I want to learn</h4>
                <div class="chips mb-2">
                  <span v-for="skill in skillsOf('skillsLearn')" :key="skill.name" class="chip chip-learn">{{ skill.name }}</span>
                  <small v-if="skillsOf('skillsLearn').length === 0" class="text-muted">None yet.</small>
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="goTo('/skills/learn')">
                  Manage learning skills
                </button>
              </div>
            </div>
          </section>

          <!-- Email -->
          <section id="edit-email" class="part">
            <p class="eyebrow mb-1">LOGIN</p>
            <h3 class="h5 mb-2">Email</h3>
            <p class="small text-muted">
              You log in with <strong>{{ store.profile.email }}</strong>. We'll send a link to the new address to confirm it.
            </p>
            <form @submit.prevent="changeEmail">
              <div class="row g-2">
                <div class="col-12 col-md-6">
                  <label for="edit-new-email" class="form-label">New email</label>
                  <input id="edit-new-email" v-model="emailForm.newEmail" type="email" class="form-control" required />
                </div>
                <div class="col-12 col-md-6">
                  <label for="edit-email-password" class="form-label">Current password</label>
                  <input
                    id="edit-email-password"
                    v-model="emailForm.password"
                    type="password"
                    class="form-control"
                    autocomplete="current-password"
                    required
                  />
                </div>
              </div>
              <button type="submit" class="btn btn-sm btn-outline-secondary mt-3" :disabled="emailForm.busy">
                {{ emailForm.busy ? 'Sending...' : 'Change email' }}
              </button>
              <p v-if="emailForm.message" class="small mt-2 mb-0" :class="emailForm.isError ? 'text-danger' : 'text-success'" role="status">
                {{ emailForm.message }}
              </p>
            </form>
          </section>

          <!-- Password -->
          <section id="edit-password" class="part">
            <p class="eyebrow mb-1">LOGIN</p>
            <h3 class="h5 mb-3">Password</h3>
            <form @submit.prevent="changePassword">
              <div class="mb-2">
                <label for="edit-pw-current" class="form-label">Current password</label>
                <input
                  id="edit-pw-current"
                  v-model="pwForm.current"
                  :type="pwForm.show ? 'text' : 'password'"
                  class="form-control"
                  autocomplete="current-password"
                  required
                />
              </div>
              <div class="row g-2">
                <div class="col-12 col-md-6">
                  <label for="edit-pw-new" class="form-label">New password</label>
                  <input
                    id="edit-pw-new"
                    v-model="pwForm.next"
                    :type="pwForm.show ? 'text' : 'password'"
                    class="form-control"
                    autocomplete="new-password"
                    required
                  />
                </div>
                <div class="col-12 col-md-6">
                  <label for="edit-pw-repeat" class="form-label">New password again</label>
                  <input
                    id="edit-pw-repeat"
                    v-model="pwForm.repeat"
                    :type="pwForm.show ? 'text' : 'password'"
                    class="form-control"
                    autocomplete="new-password"
                    required
                  />
                </div>
              </div>

              <div v-if="strength" class="mt-2">
                <div class="progress strength-bar">
                  <div class="progress-bar" :class="strength.colour" :style="{ width: strength.percent + '%' }"></div>
                </div>
                <small class="text-muted">Strength: {{ strength.label }}</small>
              </div>

              <div class="form-check mt-2">
                <input id="edit-pw-show" v-model="pwForm.show" class="form-check-input" type="checkbox" />
                <label for="edit-pw-show" class="form-check-label small">Show passwords</label>
              </div>

              <p v-if="pwProblem" class="small text-danger mt-2 mb-0">{{ pwProblem }}</p>
              <button type="submit" class="btn btn-sm btn-outline-secondary mt-3" :disabled="pwForm.busy || pwProblem !== ''">
                {{ pwForm.busy ? 'Updating...' : 'Update password' }}
              </button>
              <p v-if="pwForm.message" class="small mt-2 mb-0" :class="pwForm.isError ? 'text-danger' : 'text-success'" role="status">
                {{ pwForm.message }}
              </p>
            </form>
          </section>

          <!-- Privacy -->
          <section id="edit-privacy" class="part">
            <p class="eyebrow mb-1">WHO SEES WHAT</p>
            <h3 class="h5 mb-3">Privacy</h3>
            <div class="form-check form-switch">
              <input id="edit-show-region" v-model="draft.showRegion" class="form-check-input" type="checkbox" role="switch" />
              <label for="edit-show-region" class="form-check-label">Show my region on my public profile</label>
            </div>
            <small class="text-muted">Your email is never shown to other members.</small>
          </section>

          <!-- Delete account -->
          <section id="edit-delete" class="part part-delete">
            <h3 class="h5 mb-2 text-danger">Delete account</h3>
            <p class="small mb-3">
              This removes your profile, your courses, your learning goals and your credits for good.
              You can't delete your account while you have an active session.
            </p>
            <form @submit.prevent="removeAccount">
              <div class="row g-2">
                <div class="col-12 col-md-6">
                  <label for="edit-delete-typed" class="form-label small">Type DELETE to confirm</label>
                  <input id="edit-delete-typed" v-model="deleteForm.typed" type="text" class="form-control" autocomplete="off" />
                </div>
                <div class="col-12 col-md-6">
                  <label for="edit-delete-password" class="form-label small">Current password</label>
                  <input
                    id="edit-delete-password"
                    v-model="deleteForm.password"
                    type="password"
                    class="form-control"
                    autocomplete="current-password"
                  />
                </div>
              </div>
              <button
                type="submit"
                class="btn btn-sm btn-danger mt-3"
                :disabled="deleteForm.busy || deleteForm.typed !== 'DELETE' || deleteForm.password === ''"
              >
                {{ deleteForm.busy ? 'Deleting...' : 'Delete my account' }}
              </button>
              <p v-if="deleteForm.message" class="small text-danger mt-2 mb-0" role="alert">{{ deleteForm.message }}</p>
            </form>
          </section>
        </div>
      </div>

      <footer class="edit-footer d-flex justify-content-between align-items-center gap-2 px-4 py-3">
        <small v-if="formError" class="text-danger fw-semibold" role="alert">{{ formError }}</small>
        <small v-else class="text-muted">{{ hasChanges ? 'You have unsaved changes.' : '' }}</small>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-outline-secondary" :disabled="!hasChanges || store.saving" @click="undoChanges">
            Undo
          </button>
          <button type="button" class="btn btn-kongsi" :disabled="!hasChanges || store.saving" @click="save">
            {{ store.saving ? 'Saving...' : 'Save changes' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
/* The colours, and the classes k-card, btn-kongsi and eyebrow, come from src/assets/theme.css */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050; /* above the sticky top bar */
  background: rgba(35, 29, 21, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.edit-modal {
  width: 100%;
  max-width: 920px;
  height: min(720px, 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--k-text);
}

.edit-header {
  background: var(--k-surface-alt);
  border-bottom: 1px solid var(--k-border);
}

.edit-footer {
  border-top: 1px solid var(--k-border);
}

.edit-body {
  display: flex;
  flex: 1;
  min-height: 0; /* lets the right side scroll instead of stretching the popup */
}

.tabs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 190px;
  flex-shrink: 0;
  padding: 12px;
  border-right: 1px solid var(--k-border);
}

.tab {
  text-align: left;
  border: 0;
  border-left: 3px solid transparent;
  border-radius: 8px;
  background: none;
  padding: 8px 12px;
  color: var(--k-text);
}

.tab:hover {
  background: var(--k-surface-alt);
}

.tab.active {
  background: var(--k-surface-alt);
  border-left-color: var(--k-brand);
  font-weight: 600;
}

.tab-delete {
  margin-top: auto;
  color: var(--k-danger);
}

.scroll-box {
  position: relative; /* so each part's offsetTop is measured from here */
  flex: 1;
  overflow-y: auto;
  padding: 4px 24px 0;
}

/* room after the last part, so every tab can bring its part to the top */
.scroll-box::after {
  content: '';
  display: block;
  height: calc(100% - 140px);
}

.part {
  padding: 20px 0;
  border-bottom: 1px solid var(--k-border);
}

.part-delete {
  margin-top: 24px;
  padding: 20px;
  border: 1px solid var(--k-danger);
  border-radius: 12px;
}

.photo {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
}

.photo-empty {
  display: grid;
  place-items: center;
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-size: 24px;
  font-weight: 700;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--k-brand-soft);
  font-size: 0.875rem;
}

.chip-learn {
  background: var(--k-surface-alt);
}

.strength-bar {
  height: 6px;
}

/* Phone: the tabs become a strip along the top */
@media (max-width: 767.98px) {
  .modal-overlay {
    padding: 8px;
  }

  .edit-modal {
    height: 100%;
  }

  .edit-body {
    flex-direction: column;
  }

  .tabs {
    flex-direction: row;
    width: auto;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--k-border);
    padding: 8px;
  }

  .tab {
    white-space: nowrap;
    border-left: 0;
    border-bottom: 3px solid transparent;
    border-radius: 8px 8px 0 0;
  }

  .tab.active {
    border-bottom-color: var(--k-brand);
  }

  .tab-delete {
    margin-top: 0;
  }

  .scroll-box {
    padding: 0 16px;
  }

  .edit-footer {
    padding: 12px 16px !important;
  }
}
</style>
