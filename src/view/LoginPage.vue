<script setup>
import { ref } from 'vue'
import { auth } from '../firebase'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { useRouter, useRoute } from 'vue-router'
import { checkAdmin, errorText } from '../services/api'
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

// someone who followed an invite link (or pressed "Sign up" on the landing page) most likely
// needs to sign up
const isSignup = ref(inviteCode !== '' || route.query.mode === 'signup')
const isError = ref(false)

const email = ref('')
const password = ref('')
const message = ref('')

function switchMode() {
  isSignup.value = !isSignup.value
  message.value = ''
}

// The flip swaps in a new card, so the button that was pressed is gone. Put keyboard focus on
// the same button in the new card, so a keyboard user is not sent back to the top of the page.
// (after-enter only runs after a switch, never on the first load.)
const switchButton = ref(null)

function focusSwitch() {
  if (switchButton.value) switchButton.value.focus()
}

async function submit() {
  isError.value = false
  message.value = 'Trying...'
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
    message.value = 'Failed: ' + error.code
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

    <!-- The photo stays on its side and fades to the other one; the card flips over -->
    <div class="row g-0">
      <div class="col-12 col-md-6 image-panel">
        <Transition name="fade">
          <img :key="isSignup" :src="isSignup ? signupImg : loginImg" alt="Students teaching each other" />
        </Transition>
      </div>

      <div class="col-12 col-md-6 form-side d-flex align-items-center justify-content-center p-3 p-md-4">
        <Transition name="flip" mode="out-in" @after-enter="focusSwitch">
          <form :key="isSignup" class="card border-0 shadow w-100 p-4 p-md-5" @submit.prevent="submit">
            <h2 class="h4 mb-4">{{ isSignup ? 'Sign up' : 'Login' }}</h2>

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
</style>