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

// someone who followed an invite link most likely needs to sign up
const isSignup = ref(inviteCode !== '')
const isError = ref(false)

const email = ref('')
const password = ref('')
const message = ref('')

function switchMode() {
  isSignup.value = !isSignup.value
  message.value = ''
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
      <h1 class="h3 m-0 d-inline-flex align-items-center gap-2">
        <LogoMark />
        Kongsi
      </h1>
    </header>

    <div class="row g-0" :class="{ 'flex-md-row-reverse': isSignup }">
      <div class="col-12 col-md-6 image-panel">
        <img :src="isSignup ? signupImg : loginImg" alt="Students teaching each other" />
      </div>

      <div class="col-12 col-md-6 form-side d-flex align-items-center justify-content-center p-3 p-md-4">
        <form class="card border-0 shadow w-100 p-4 p-md-5" @submit.prevent="submit">
          <h2 class="h4 mb-4">{{ isSignup ? 'Sign up' : 'Login' }}</h2>

          <p v-if="isSignup && inviteCode !== ''" class="small text-muted mb-3">
            A friend invited you to Kongsi. Sign up to start teaching and learning.
          </p>

          <div class="mb-3">
            <label for="email" class="form-label fw-semibold">Email</label>
            <input id="email" v-model="email" type="email" class="form-control" required />
          </div>

          <div class="mb-3">
            <label for="password" class="form-label fw-semibold">Password</label>
            <input id="password" v-model="password" type="password" class="form-control" required />
          </div>

          <button type="submit" class="btn btn-brand w-100 mt-2">
            {{ isSignup ? 'Sign up' : 'Log in' }}
          </button>

          <p v-if="message" class="small mt-3 mb-0" :class="isError ? 'text-danger' : 'text-success'">{{ message }}</p>

          <p class="text-center small mt-3 mb-0">
            {{ isSignup ? 'Already have an account?' : "Don't have an account?" }}
            <button type="button" class="btn btn-link btn-sm p-0 link-brand" @click="switchMode">
              {{ isSignup ? 'Log in' : 'Sign up' }}
            </button>
          </p>
        </form>
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