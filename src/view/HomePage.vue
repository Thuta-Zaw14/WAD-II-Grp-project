<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { getMe } from '../services/api'

const router = useRouter()
const user = ref(null)
const credits = ref(0)

async function loadProfile() {
  try {
    const profile = await getMe()
    credits.value = profile.credits
  } catch (error) {
    console.error('Could not load profile:', error.message)
  }
}

function handleAuthChange(firebaseUser) {
  if (firebaseUser) {
    user.value = firebaseUser
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

// Booking popup
const selectedSkill = ref(null)

// Builds a fresh list each time, so every skill gets its own copy
function makeSlots() {
  return [
    { id: 1, date: '2026-10-22', time: '10:00', booked: false },
    { id: 2, date: '2026-10-22', time: '14:00', booked: true },
    { id: 3, date: '2026-10-24', time: '09:00', booked: false },
    { id: 4, date: '2026-10-25', time: '16:00', booked: false },
  ]
}

// One list of slots per skill, created the first time its popup opens
const slotsBySkill = ref({})

// The slots for whichever popup is open
const currentSlots = computed(() => {
  if (!selectedSkill.value) return []
  return slotsBySkill.value[selectedSkill.value.id] || []
})

function openBooking(skill) {
  if (!slotsBySkill.value[skill.id]) {
    slotsBySkill.value[skill.id] = makeSlots()
  }
  selectedSkill.value = skill
}

function closeBooking() {
  selectedSkill.value = null
}

function book(slot) {
  if (slot.booked) return
  slot.booked = true
}

const slotsByDate = computed(() => {
  const groups = {}
  for (const slot of currentSlots.value) {
    if (!groups[slot.date]) groups[slot.date] = []
    groups[slot.date].push(slot)
  }
  return groups
})

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
  <nav class="navbar border-bottom px-3">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <div class="d-flex align-items-center gap-3">
      <a href="#" class="text-decoration-none text-dark" @click.prevent="goToSessions">My sessions</a>
      <small v-if="user" class="text-muted d-none d-md-inline">{{ user.email }}</small>
      <button class="btn btn-sm" @click="logout">Log out</button>
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
            <button class="btn btn-brand w-100" @click="openBooking(s)">Request session</button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="filteredSkills.length === 0" class="text-muted">No skills match your search.</p>
  </div>
  
    <div
    v-if="selectedSkill"
    class="modal d-block"
    style="background: rgba(0, 0, 0, 0.5)"
    @click.self="closeBooking"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header banner">
          <div>
            <h2 class="h5 mb-0">{{ selectedSkill.skill }}</h2>
            <small>Coach: {{ selectedSkill.teacher }}</small>
          </div>
          <button class="btn-close" @click="closeBooking"></button>
        </div>

        <div class="modal-body">
          <p class="text-muted">Pick a time that suits you.</p>

          <div v-for="(daySlots, date) in slotsByDate" :key="date" class="mb-3">
            <div class="fw-bold mb-2">{{ date }}</div>
            <div class="d-flex flex-wrap gap-2">
              <button
                v-for="slot in daySlots"
                :key="slot.id"
                class="btn btn-sm"
                :class="slot.booked ? 'btn-outline-secondary' : 'btn-brand'"
                :disabled="slot.booked"
                @click="book(slot)"
              >
                {{ slot.time }}
              </button>
            </div>
          </div>

          <p v-if="currentSlots.length === 0" class="text-muted">This coach has no available times yet.</p>
        </div>
      </div>
    </div>
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