<script setup>
import { ref, reactive, computed } from 'vue'
import { auth } from '../firebase'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { useRouter, useRoute } from 'vue-router'
import { checkAdmin, verifyResetCode, resetPassword, errorText } from '../services/api'
import { markActive } from '../services/idleLogout'
import { IDLE_LOGOUT_MINUTES } from '../config'
import LogoMark from '../components/LogoMark.vue'

import loginImg from '../assets/login.jpg'
import signupImg from '../assets/signup.jpg'

const router = useRouter()
const route = useRoute()

// An invite link looks like /login?ref=<the friend's code>. Remember the code until the new
// profile is created (services/api.js sends it then). Opening the login page WITHOUT a code
// forgets any old one, so nobody gets credited to a friend they never followed.
const inviteCode = typeof route.query.ref === 'string' ? route.query.ref : ''
if (inviteCode !== '') {
  localStorage.setItem('inviteRef', inviteCode)
} else {
  localStorage.removeItem('inviteRef')
}

// Which card is showing:
//   'login', 'signup'
//   'forgot'      - "Forget Password": the email and the verification code
//   'newPassword' - the code was right: enter the new password twice
// Someone who followed an invite link (or pressed "Sign up" on the landing page) most likely
// needs to sign up.
const mode = ref(inviteCode !== '' || route.query.mode === 'signup' ? 'signup' : 'login')
const isSignup = computed(() => mode.value === 'signup')
const isError = ref(false)

const email = ref('')
const password = ref('')
const message = ref('')

// set when main.js logged someone out for being away too long (services/idleLogout.js)
const idleNotice = route.query.reason === 'idle'
  ? 'You were logged out after ' + IDLE_LOGOUT_MINUTES + ' minutes without activity. Please log in again.'
  : ''

function switchMode() {
  mode.value = isSignup.value ? 'login' : 'signup'
  message.value = ''
}

// The flip swaps in a new card, so the button that was pressed is gone. Put keyboard focus
// somewhere sensible in the new card (the first box of the reset cards, otherwise the
// Log in / Sign up switch), so a keyboard user is not sent back to the top of the page.
// (after-enter only runs after a switch, never on the first load.)
const switchButton = ref(null)
const firstResetField = ref(null)

function focusNewCard() {
  if (firstResetField.value) firstResetField.value.focus()
  else if (switchButton.value) switchButton.value.focus()
}

// ---------- Forget Password ----------
// The code is checked by the server (routes/passwordResets.js), and checked again when the new
// password is saved, so skipping the code card does not help anyone.
const reset = reactive({ email: '', code: '', password: '', repeat: '', busy: false, error: '' })
const resetErrors = reactive({ email: '', code: '', password: '', repeat: '' })

function clearResetErrors() {
  reset.error = ''
  for (const field in resetErrors) resetErrors[field] = ''
}

function startReset() {
  reset.email = email.value.trim() // whatever was already typed on the login card
  reset.code = ''
  reset.password = ''
  reset.repeat = ''
  clearResetErrors()
  message.value = ''
  mode.value = 'forgot'
}

function backToLogin() {
  clearResetErrors()
  mode.value = 'login'
}

async function checkCode() {
  clearResetErrors()
  if (reset.email.trim() === '') resetErrors.email = 'Please enter the email you signed up with.'
  if (!/^[0-9]{6}$/.test(reset.code.trim())) resetErrors.code = 'Enter the 6-digit code.'
  if (resetErrors.email || resetErrors.code) return

  reset.busy = true
  try {
    await verifyResetCode(reset.email.trim(), reset.code.trim())
    mode.value = 'newPassword'
  } catch (err) {
    reset.error = errorText(err)
  }
  reset.busy = false
}

async function saveNewPassword() {
  clearResetErrors()
  if (reset.password.length < 6) resetErrors.password = 'Your password must be at least 6 characters long.'
  if (reset.repeat === '') resetErrors.repeat = 'Please enter the password again.'
  else if (reset.repeat !== reset.password) resetErrors.repeat = 'The two passwords do not match.'
  if (resetErrors.password || resetErrors.repeat) return

  reset.busy = true
  try {
    await resetPassword(reset.email.trim(), reset.code.trim(), reset.password)
    // back to the login card, ready to log in with the new password
    email.value = reset.email.trim()
    password.value = ''
    reset.password = ''
    reset.repeat = ''
    isError.value = false
    message.value = 'Your password has been changed. Log in with your new password.'
    mode.value = 'login'
  } catch (err) {
    reset.error = errorText(err)
  }
  reset.busy = false
}

async function submit() {
  isError.value = false
  message.value = 'Trying...'
  markActive() // start the inactivity clock afresh, before the login starts it watching
  try {
    if (isSignup.value) {
      const result = await createUserWithEmailAndPassword(auth, email.value, password.value)
      message.value = 'Account created for ' + result.user.email
      router.push('/home')
    } else {
      const result = await signInWithEmailAndPassword(auth, email.value, password.value)
      localStorage.removeItem('inviteRef') // an existing account cannot be invited
      message.value = 'Logged in as ' + result.user.email
      await goToStartPage()
    }
  } catch (error) {
    isError.value = true
    // Firebase allows one account per email, so signing up with a taken one (an admin's too) fails here.
    // Its only password rule (no custom policy is set for the project) is a minimum of 6 characters.
    if (error.code === 'auth/email-already-in-use') {
      message.value = 'This email is already registered. Please try a different email.'
    } else if (error.code === 'auth/weak-password') {
      message.value = 'Your password must be at least 6 characters long.'
    } else {
      message.value = 'Failed: ' + error.code
    }
  }
}

// Admins go to the admin page, everybody else to the home page. A banned person is
// refused by the server on this very first request, so they are logged straight out again.
async function goToStartPage() {
  let admin = false
  try {
    const answer = await checkAdmin()
    admin = answer.isAdmin
  } catch (err) {
    if (err.response && err.response.status === 403) {
      await signOut(auth)
      isError.value = true
      message.value = 'Failed: ' + errorText(err)
      return
    }
    // any other problem: carry on as a normal user (the admin pages check again anyway)
  }
  router.push(admin ? '/admins' : '/home')
}
</script>

<template>
  <div class="page">
    <header class="top text-center py-3 py-md-4">
      <h1 class="h3 m-0">
        <RouterLink to="/" class="home-link d-inline-flex align-items-center gap-2 text-decoration-none">
          <LogoMark />
          Kongsi
        </RouterLink>
      </h1>
    </header>

    <!-- The photo stays on its side and fades to the other one; the card flips over.
         On a phone the photo is the background and the card sits on top of it. -->
    <div class="row g-0 body-row">
      <div class="col-12 col-md-6 image-panel">
        <Transition name="fade">
          <img :key="isSignup" :src="isSignup ? signupImg : loginImg" alt="Students teaching each other" />
        </Transition>
      </div>

      <div class="col-12 col-md-6 form-side d-flex align-items-center justify-content-center p-3 p-md-4">
        <Transition name="flip" mode="out-in" @after-enter="focusNewCard">
          <!-- Forget Password, step 1: the verification code -->
          <form
            v-if="mode === 'forgot'"
            key="forgot"
            class="card border-0 shadow w-100 p-4 p-md-5"
            novalidate
            @submit.prevent="checkCode"
          >
            <h2 class="h4 mb-2">Forget Password</h2>
            <p class="text-muted mb-4">A verification code will be sent to your email.</p>

            <div class="mb-3">
              <label for="reset-email" class="form-label fw-semibold">Email</label>
              <input
                id="reset-email"
                ref="firstResetField"
                v-model="reset.email"
                type="email"
                class="form-control"
                :class="{ 'is-invalid': resetErrors.email }"
                :aria-invalid="!!resetErrors.email"
                :aria-describedby="resetErrors.email ? 'reset-email-error' : undefined"
                autocomplete="email"
              />
              <div v-if="resetErrors.email" id="reset-email-error" class="invalid-feedback d-block">{{ resetErrors.email }}</div>
            </div>

            <div class="mb-3">
              <label for="reset-code" class="form-label fw-semibold">Verification code</label>
              <input
                id="reset-code"
                v-model="reset.code"
                type="text"
                inputmode="numeric"
                maxlength="6"
                class="form-control code-input"
                :class="{ 'is-invalid': resetErrors.code }"
                :aria-invalid="!!resetErrors.code"
                :aria-describedby="resetErrors.code ? 'reset-code-error' : undefined"
                autocomplete="one-time-code"
                placeholder="6-digit code"
              />
              <div v-if="resetErrors.code" id="reset-code-error" class="invalid-feedback d-block">{{ resetErrors.code }}</div>
            </div>

            <p v-if="reset.error" class="small text-danger" role="alert">{{ reset.error }}</p>

            <button type="submit" class="btn btn-brand w-100 mt-2" :disabled="reset.busy">
              {{ reset.busy ? 'Checking...' : 'Verify' }}
            </button>
            <p class="text-center small mt-3 mb-0">
              <button type="button" class="btn btn-link btn-sm p-0 link-brand" @click="backToLogin">Back to login</button>
            </p>
          </form>

          <!-- Forget Password, step 2: the new password -->
          <form
            v-else-if="mode === 'newPassword'"
            key="newPassword"
            class="card border-0 shadow w-100 p-4 p-md-5"
            novalidate
            @submit.prevent="saveNewPassword"
          >
            <h2 class="h4 mb-2">Set a new password</h2>
            <p class="text-muted mb-4">For {{ reset.email.trim() }}</p>

            <div class="mb-3">
              <label for="reset-password" class="form-label fw-semibold">Enter Password</label>
              <input
                id="reset-password"
                ref="firstResetField"
                v-model="reset.password"
                type="password"
                class="form-control"
                :class="{ 'is-invalid': resetErrors.password }"
                :aria-invalid="!!resetErrors.password"
                :aria-describedby="resetErrors.password ? 'reset-password-error' : 'reset-password-help'"
                autocomplete="new-password"
              />
              <div v-if="resetErrors.password" id="reset-password-error" class="invalid-feedback d-block">{{ resetErrors.password }}</div>
              <small v-else id="reset-password-help" class="text-muted">At least 6 characters.</small>
            </div>

            <div class="mb-3">
              <label for="reset-repeat" class="form-label fw-semibold">Re-enter Password</label>
              <input
                id="reset-repeat"
                v-model="reset.repeat"
                type="password"
                class="form-control"
                :class="{ 'is-invalid': resetErrors.repeat }"
                :aria-invalid="!!resetErrors.repeat"
                :aria-describedby="resetErrors.repeat ? 'reset-repeat-error' : undefined"
                autocomplete="new-password"
              />
              <div v-if="resetErrors.repeat" id="reset-repeat-error" class="invalid-feedback d-block">{{ resetErrors.repeat }}</div>
            </div>

            <p v-if="reset.error" class="small text-danger" role="alert">{{ reset.error }}</p>

            <button type="submit" class="btn btn-brand w-100 mt-2" :disabled="reset.busy">
              {{ reset.busy ? 'Saving...' : 'Change password' }}
            </button>
            <p class="text-center small mt-3 mb-0">
              <button type="button" class="btn btn-link btn-sm p-0 link-brand" @click="backToLogin">Back to login</button>
            </p>
          </form>

          <!-- Login and Sign up -->
          <form v-else :key="mode" class="card border-0 shadow w-100 p-4 p-md-5" @submit.prevent="submit">
            <h2 class="h4 mb-4">{{ isSignup ? 'Sign up' : 'Login' }}</h2>

            <p v-if="!isSignup && idleNotice" class="alert alert-info small py-2 mb-3" role="status">{{ idleNotice }}</p>

            <p v-if="isSignup && inviteCode !== ''" class="small text-muted mb-3">
              A friend invited you to Kongsi. Sign up to start teaching and learning.
            </p>

            <div class="mb-3">
              <label for="email" class="form-label fw-semibold">Email</label>
              <input id="email" v-model="email" type="email" class="form-control" autocomplete="email" required />
            </div>

            <div class="mb-3">
              <label for="password" class="form-label fw-semibold">Password</label>
              <input
                id="password"
                v-model="password"
                type="password"
                class="form-control"
                :autocomplete="isSignup ? 'new-password' : 'current-password'"
                required
              />
              <div v-if="!isSignup" class="text-end mt-1">
                <button type="button" class="btn btn-link btn-sm p-0 link-brand" @click="startReset">Forget Password</button>
              </div>
            </div>

            <button type="submit" class="btn btn-brand w-100 mt-2">
              {{ isSignup ? 'Sign up' : 'Log in' }}
            </button>

            <p v-if="message" class="small mt-3 mb-0" :class="isError ? 'text-danger' : 'text-success'">{{ message }}</p>

            <p class="text-center small mt-3 mb-0">
              {{ isSignup ? 'Already have an account?' : "Don't have an account?" }}
              <button ref="switchButton" type="button" class="btn btn-link btn-sm p-0 link-brand" @click="switchMode">
                {{ isSignup ? 'Log in' : 'Sign up' }}
              </button>
            </p>
          </form>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr; 
}

.top {
  background: var(--k-surface-alt);
  border-bottom: 1px solid var(--k-border);
  color: var(--k-accent);
}

.home-link {
  color: inherit;
}

.image-panel {
  position: relative;
  overflow: hidden;
  min-height: 180px;
  background: var(--k-surface-alt);
}

.image-panel img {
  position: absolute;
  top: 0; 
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.form-side {
  background: var(--k-bg);
  perspective: 1200px; /* gives the card flip its depth */
}

/* Phones: the photo fills the whole area behind the card */
@media (max-width: 767.98px) {
  .body-row {
    position: relative;
  }

  .image-panel {
    position: absolute;
    inset: 0;
    min-height: 0;
  }

  .form-side {
    position: relative; /* above the photo */
    background: transparent;
  }
}

/* ---------- Switching between Login and Sign up ----------
   The card turns away to its edge (ease-in), the content swaps while it is edge-on, then the
   new side turns towards you (ease-out). About 0.3s in total: quick, but easy to follow. */
.flip-enter-active {
  transition: transform 0.16s ease-out, opacity 0.16s ease-out;
}

.flip-leave-active {
  transition: transform 0.14s ease-in, opacity 0.14s ease-in;
}

.flip-leave-to {
  transform: rotateY(90deg);
  opacity: 0.6;
}

.flip-enter-from {
  transform: rotateY(-90deg);
  opacity: 0.6;
}

/* the two photos sit on top of each other while one fades into the other */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* people who asked for less motion get a short fade instead of the flip */
@media (prefers-reduced-motion: reduce) {
  .flip-enter-active,
  .flip-leave-active {
    transition: opacity 0.12s linear;
  }

  .flip-enter-from,
  .flip-leave-to {
    transform: none;
    opacity: 0;
  }
}

.card {
  max-width: 400px;
}

.link-brand {
  color: var(--k-brand);
  font-weight: 600;
  text-decoration: none;
  vertical-align: baseline;
}

/* the 6-digit code, spaced out so it is easy to check */
.code-input {
  letter-spacing: 0.3em;
  font-variant-numeric: tabular-nums;
}
</style>