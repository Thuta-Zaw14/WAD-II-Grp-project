<script setup>
import { ref } from 'vue'
import { auth } from '../firebase'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { useRouter } from 'vue-router'
import axios from 'axios'

import loginImg from '../assets/login.jpg'
import signupImg from '../assets/signup.jpg'

const router = useRouter()

const isSignup = ref(false)
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
    } else {
      const result = await signInWithEmailAndPassword(auth, email.value, password.value)
      message.value = 'Logged in as ' + result.user.email
      const token = await result.user.getIdToken()
      try {
        await axios.get('/api/admins/check', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
        message.value = 'Logged in as admin'
        router.push('/admins')
      } catch (error) {
        console.log(error)
        message.value = 'Logged in as user: ' + result.user.email 
        router.push('/home')
      }
    }
  } catch (error) {
    isError.value = true
    message.value = 'Failed: ' + error.code
  }
}
</script>

<template>
  <div class="page">
    <header class="top text-center py-3 py-md-4">
      <h1 class="h3 m-0">Kongsi</h1>
    </header>

    <div class="row g-0" :class="{ 'flex-md-row-reverse': isSignup }">
      <div class="col-12 col-md-6 image-panel">
        <img :src="isSignup ? signupImg : loginImg" alt="Students teaching each other" />
      </div>

      <div class="col-12 col-md-6 form-side d-flex align-items-center justify-content-center p-3 p-md-4">
        <form class="card border-0 shadow w-100 p-4 p-md-5" @submit.prevent="submit">
          <h2 class="h4 mb-4">{{ isSignup ? 'Sign up' : 'Login' }}</h2>

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
  background: #f5f0e1;
  border-bottom: 1px solid #e3d9bf;
  color: #4a3f2a;
}

.image-panel {
  position: relative;
  overflow: hidden;
  min-height: 180px;
  background: #e8dcc4;
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
  background: #fbf8f0;
}

.card {
  max-width: 400px;
  border-radius: 14px;
}

.btn-brand {
  background: #b5835a;
  border-color: #b5835a;
  color: white;
  font-weight: 600;
}

.btn-brand:hover {
  background: #9c6e48;
  border-color: #9c6e48;
  color: white;
}

.link-brand {
  color: #b5835a;
  font-weight: 600;
  text-decoration: none;
  vertical-align: baseline;
}

.form-control:focus {
  border-color: #b5835a;
  box-shadow: 0 0 0 3px rgba(181, 131, 90, 0.2);
}
</style>