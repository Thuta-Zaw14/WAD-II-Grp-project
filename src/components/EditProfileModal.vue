<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
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
// New photos can't be added any more (the site does not take picture uploads). Someone who
// added one before can still remove it, and until then it is shown.
const initials = computed(() => {
  const words = draft.name.trim().split(' ').filter((w) => w !== '')
  if (words.length === 0) return '?'
  let letters = words[0][0]
  if (words.length > 1) letters += words[words.length - 1][0]
  return letters.toUpperCase()
})

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
    'auth/requires-recent-login': 'Please log out and log in again, then try again.',
  }
  return messages[err.code] || 'Something went wrong: ' + (err.code || err.message)
}

// Firebase asks for the password again before some changes (see changePassword and removeAccount)
async function checkPassword(password) {
  const credential = EmailAuthProvider.credential(auth.currentUser.email, password)
  await reauthenticateWithCredential(auth.currentUser, credential)
}

// ---------- Password ----------
// The email someone registered with cannot be changed, only the password.
// The boxes for a new password only show after "Change Password" is pressed.
// needsCurrent: Firebase only lets someone who logged in a few minutes ago change their
// password straight away. Otherwise it asks for the current one first, so that box appears too.
const pwForm = reactive({
  open: false, current: '', next: '', repeat: '', needsCurrent: false,
  show: false, busy: false, message: '', isError: false,
})

function openPasswordForm() {
  pwForm.open = true
  pwForm.message = ''
}

function closePasswordForm() {
  pwForm.open = false
  pwForm.current = ''
  pwForm.next = ''
  pwForm.repeat = ''
  pwForm.needsCurrent = false
  pwForm.show = false
}

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
  if (pwForm.needsCurrent && pwForm.next !== '' && pwForm.next === pwForm.current) {
    return 'Pick a password different from your current one.'
  }
  return ''
})

async function changePassword() {
  pwForm.message = ''
  if (pwForm.next === '' || pwForm.repeat === '') {
    pwForm.isError = true
    pwForm.message = 'Enter the new password in both boxes.'
    return
  }
  if (pwProblem.value !== '') return

  pwForm.busy = true
  try {
    if (pwForm.needsCurrent) await checkPassword(pwForm.current)
    await updatePassword(auth.currentUser, pwForm.next)
    closePasswordForm()
    pwForm.isError = false
    pwForm.message = 'Password updated.'
    toast.show('Password updated.')
  } catch (err) {
    pwForm.isError = true
    if (err.code === 'auth/requires-recent-login') {
      pwForm.needsCurrent = true
      pwForm.message = 'For your safety, enter your current password too, then press Confirm again.'
    } else {
      pwForm.message = loginErrorText(err)
    }
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
              <button
                v-if="draft.photo"
                type="button"
                class="btn btn-sm btn-link text-danger p-0"
                @click="draft.photo = ''"
              >
                Remove photo
              </button>
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

          <!-- Email and password (the email can't be changed) -->
          <section id="edit-password" class="part">
            <p class="eyebrow mb-1">LOGIN</p>
            <h3 class="h5 mb-3">Email and password</h3>

            <p class="mb-1">
              <span class="text-muted">Registered email:</span>
              <strong class="ms-1">{{ store.profile.email }}</strong>
            </p>
            <p class="mb-3">
              <span class="text-muted">Password:</span>
              <span class="ms-1 password-dots" aria-label="Hidden password">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
            </p>

            <button
              v-if="!pwForm.open"
              type="button"
              class="btn btn-sm btn-outline-secondary"
              aria-controls="password-form"
              aria-expanded="false"
              @click="openPasswordForm"
            >
              Change Password
            </button>

            <form v-else id="password-form" novalidate @submit.prevent="changePassword">
              <div v-if="pwForm.needsCurrent" class="mb-2">
                <label for="edit-pw-current" class="form-label">Current password</label>
                <input
                  id="edit-pw-current"
                  v-model="pwForm.current"
                  :type="pwForm.show ? 'text' : 'password'"
                  class="form-control"
                  autocomplete="current-password"
                />
              </div>
              <div class="mb-2">
                <label for="edit-pw-new" class="form-label">New password</label>
                <input
                  id="edit-pw-new"
                  v-model="pwForm.next"
                  :type="pwForm.show ? 'text' : 'password'"
                  class="form-control"
                  autocomplete="new-password"
                />
              </div>
              <div class="mb-2">
                <label for="edit-pw-repeat" class="form-label">Re-enter new password</label>
                <input
                  id="edit-pw-repeat"
                  v-model="pwForm.repeat"
                  :type="pwForm.show ? 'text' : 'password'"
                  class="form-control"
                  autocomplete="new-password"
                />
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
              <div class="d-flex gap-2 mt-3">
                <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="pwForm.busy" @click="closePasswordForm(); pwForm.message = ''">
                  Cancel
                </button>
                <button type="submit" class="btn btn-sm btn-kongsi" :disabled="pwForm.busy || pwProblem !== ''">
                  {{ pwForm.busy ? 'Saving...' : 'Confirm' }}
                </button>
              </div>
            </form>

            <p v-if="pwForm.message" class="small mt-2 mb-0" :class="pwForm.isError ? 'text-danger' : 'text-success'" role="status">
              {{ pwForm.message }}
            </p>
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

.password-dots {
  letter-spacing: 2px;
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
