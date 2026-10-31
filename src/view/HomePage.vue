<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { getMe } from '../services/api'

const router = useRouter()
const user = ref(null)
const credits = ref(0)
const displayName = ref('Profile')

async function loadProfile() {
  try {
    const profile = await getMe()
    credits.value = profile.credits
    displayName.value = profile.name?.trim() || 'Profile'
  } catch (error) {
    console.error('Could not load profile:', error.message)
  }
}

function handleAuthChange(firebaseUser) {
  if (firebaseUser) {
    user.value = firebaseUser
    displayName.value = 'Profile'
    loadProfile()
  } else {
    router.push('/login')
  }
}

const stopListening = onAuthStateChanged(auth, handleAuthChange)

onUnmounted(stopListening)

async function logout() {
  await signOut(auth)
}

function goToSessions() {
  router.push('/sessions')
}

// Fake data for now
const search = ref('')
const skills = ref([
  { id: 1, skill: 'Tennis', teacher: 'Alex T.', category: 'Sports' },
  { id: 2, skill: 'Videography', teacher: 'Mei L.', category: 'Creative' },
  { id: 3, skill: 'Guitar basics', teacher: 'Daniel K.', category: 'Music' },
  { id: 4, skill: 'Python intro', teacher: 'Sara R.', category: 'Tech' },
  { id: 5, skill: 'Photo editing', teacher: 'Jun W.', category: 'Creative' },
  { id: 6, skill: 'Basketball', teacher: 'Chris P.', category: 'Sports' },
])

const filteredSkills = computed(() => {
  const text = search.value.toLowerCase()
  const results = []

  for (const item of skills.value) {
    const skillMatches = item.skill.toLowerCase().includes(text)
    const teacherMatches = item.teacher.toLowerCase().includes(text)

    if (skillMatches || teacherMatches) {
      results.push(item)
    }
  }

  return results
})
</script>

<template>
  <nav class="navbar border-bottom px-3 justify-content-between">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <div class="d-flex align-items-center gap-3">
      <a href="#" class="text-decoration-none text-dark" @click.prevent="goToSessions">My Sessions</a>
      <button
        v-if="user"
        type="button"
        class="btn btn-link text-dark p-0 text-decoration-none"
        @click="router.push('/profile')"
      >
        {{ displayName }}
      </button>
      <button class="btn btn-sm" @click="logout">Log Out</button>
    </div>
  </nav>

  <div class="container py-4">
    <div class="p-4 mb-4 rounded banner d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div>
        <h1 class="h4 mb-1">Welcome back</h1>
        <p class="mb-0">Teach a skill, earn credits, and spend them learning something new.</p>
      </div>
      <div class="text-center">
        <div class="fs-2 fw-bold">{{ credits }}</div>
        <p>time credits</p>
      </div>
    </div>

    <input
      v-model="search"
      type="search"
      class="form-control mb-4"
      placeholder="Search skills or teachers..."
    />

    <div class="row g-3">
      <div v-for="s in filteredSkills" :key="s.id" class="col-12 col-sm-6 col-lg-4">
        <div class="card h-100">
          <div class="card-body">
            <span class="badge text-bg-light mb-2">{{ s.category }}</span>
            <h2 class="h5">{{ s.skill }}</h2>
            <p class="text-muted mb-3">Taught by {{ s.teacher }}</p>
            <button class="btn btn-brand w-100">Request session</button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="filteredSkills.length === 0" class="text-muted">No skills match your search.</p>
  </div>
</template>

<style scoped>
.banner {
  background: #f5f0e1;
  color: #4a3f2a;
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
</style>