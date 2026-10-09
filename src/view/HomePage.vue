<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { getMe } from '../services/api'

const router = useRouter()
const user = ref(null)
const credits = ref(0)
let stopListening

onMounted(() => {
  stopListening = onAuthStateChanged(auth, async (u) => {
    if (u) {
      user.value = u
      try {
        const profile = await getMe()
        credits.value = profile.credits
      } catch (err) {
        console.error('Could not load profile:', err.message)
      }
    } else {
      router.push('/login')
    }
  })
})

onUnmounted(() => {
  if (stopListening) stopListening()
})

async function logout() {
  await signOut(auth)
  router.push('/login')
}

// Fake data for now; later this comes from the skills collection in MongoDB
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
  const q = search.value.toLowerCase()
  return skills.value.filter(
    (s) => s.skill.toLowerCase().includes(q) || s.teacher.toLowerCase().includes(q)
  )
})
</script>

<template>
  <nav class="navbar bg-body-tertiary border-bottom px-3">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <div class="d-flex align-items-center gap-3">
      <small v-if="user" class="text-muted d-none d-md-inline">{{ user.email }}</small>
      <button class="btn btn-outline-secondary btn-sm" @click="logout">Log out</button>
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
        <small>time credits</small>
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