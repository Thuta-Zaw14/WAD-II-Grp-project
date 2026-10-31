<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { auth } from '../firebase'
import { getMe } from '../services/api'
import SkillSearch from '../components/SkillSearch.vue'
import { matches } from '../searchUtils'

const router = useRouter()
const user = ref(null)
const credits = ref(0)
const displayName = ref('Profile')

// ---------- Login ----------
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

async function logout() {
  await signOut(auth)
}

function goToSessions() {
  router.push('/sessions')
}

// ---------- Fake data for now ----------
function makeSlots() {
  return [
    { id: 1, date: '2026-10-22', time: '10:00', booked: false },
    { id: 2, date: '2026-10-22', time: '14:00', booked: true },
    { id: 3, date: '2026-10-24', time: '09:00', booked: false },
    { id: 4, date: '2026-10-25', time: '16:00', booked: false },
  ]
}

// "place" is a public meeting spot, not the coach's home
const skills = ref([
  { id: 1, skill: 'Tennis', teacher: 'Alex T.', category: 'Sports', place: 'Jurong East Sports Hall', region: 'West', lat: 1.3331, lng: 103.7424 },
  { id: 2, skill: 'Videography', teacher: 'Mei L.', category: 'Creative', place: 'Our Tampines Hub', region: 'East', lat: 1.3547, lng: 103.94 },
  { id: 3, skill: 'Guitar basics', teacher: 'Daniel K.', category: 'Music', place: 'Somerset Library', region: 'Central', lat: 1.3004, lng: 103.839 },
  { id: 4, skill: 'Python intro', teacher: 'Sara R.', category: 'Tech', place: 'Woodlands Regional Library', region: 'North', lat: 1.437, lng: 103.7865 },
  { id: 5, skill: 'Photo editing', teacher: 'Jun W.', category: 'Creative', place: 'Bugis Junction', region: 'Central', lat: 1.3, lng: 103.856 },
  { id: 6, skill: 'Basketball', teacher: 'Chris P.', category: 'Sports', place: 'Bedok Community Club', region: 'East', lat: 1.324, lng: 103.93 },
  { id: 7, skill: 'Tennis', teacher: 'Priya N.', category: 'Sports', place: 'Toa Payoh Sports Hall', region: 'Central', lat: 1.3343, lng: 103.8563 },
  { id: 8, skill: 'Tennis', teacher: 'Marcus L.', category: 'Sports', place: 'Bishan Community Club', region: 'Central', lat: 1.3526, lng: 103.8352 },
  { id: 9, skill: 'Python intro', teacher: 'Wei H.', category: 'Tech', place: 'Jurong Regional Library', region: 'West', lat: 1.3396, lng: 103.7066 },
])

// Every skill gets its own list of time slots
for (const s of skills.value) {
  s.slots = makeSlots()
}

// ---------- Filters ----------
const search = ref('')
const categories = ['All', 'Sports', 'Creative', 'Music', 'Tech']
const regions = ['All', 'Central', 'West', 'East', 'North']
const selectedCategory = ref('All')
const selectedRegion = ref('All')

// Pin colour for each genre
const categoryColors = {
  Sports: '#d9822b',
  Creative: '#8e5ea2',
  Music: '#3b8ea5',
  Tech: '#4a7c59',
}

// ---------- Near me ----------
const userPos = ref(null) // { lat, lng } once we know where you are
const userRegion = ref('')
const locationError = ref('')
let youMarker = null

// Work out the region from coordinates (rough cut-offs, not official borders)
function getRegion(lat, lng) {
  if (lat > 1.4) return 'North'
  if (lng < 103.75) return 'West'
  if (lng > 103.9) return 'East'
  return 'Central'
}

// Straight-line distance in km. 1 degree is about 111 km (close enough for Singapore)
function distanceKm(from, to) {
  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng
  return Math.sqrt(dLat * dLat + dLng * dLng) * 111
}

function findMe() {
  locationError.value = ''
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      userPos.value = { lat, lng }
      userRegion.value = getRegion(lat, lng)

      if (youMarker) youMarker.remove()
      youMarker = L.circleMarker([lat, lng], { radius: 8, color: 'blue' }).addTo(map)
    },
    () => {
      locationError.value = 'Could not get your location. Allow location access in your browser.'
    }
  )
}

function clearLocation() {
  userPos.value = null
  userRegion.value = ''
  youMarker.remove()
}

// ---------- The list (also used for the map pins) ----------
const filteredSkills = computed(() => {
  const results = []

  for (const item of skills.value) {
    const textMatches = matches(search.value, [item.skill, item.teacher, item.category])
    const categoryMatches =
      selectedCategory.value === 'All' || item.category === selectedCategory.value
    const regionMatches = selectedRegion.value === 'All' || item.region === selectedRegion.value

    if (textMatches && categoryMatches && regionMatches) {
      const distance = userPos.value ? distanceKm(userPos.value, item) : null
      results.push({ ...item, distance })
    }
  }

  // Closest first, once we know where you are
  if (userPos.value) {
    results.sort((a, b) => a.distance - b.distance)
  }

  return results
})

// ---------- The map ----------
const mapEl = ref(null)
let map = null
let pinLayer = null

function drawPins() {
  pinLayer.clearLayers()

  for (const s of filteredSkills.value) {
    const pin = L.circleMarker([s.lat, s.lng], {
      radius: 10,
      color: 'white',
      fillColor: categoryColors[s.category],
      fillOpacity: 1,
    })
    pin.bindTooltip(s.skill)
    pin.on('click', () => openBooking(s)) // clicking a pin opens the booking popup
    pin.addTo(pinLayer)
  }
}

// Redraw the pins whenever the list changes
watch(filteredSkills, drawPins)

onMounted(() => {
  map = L.map(mapEl.value).setView([1.3521, 103.8198], 11) // middle of Singapore
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  pinLayer = L.layerGroup().addTo(map)
  drawPins()
})

onUnmounted(() => {
  stopListening()
  map.remove()
})

// ---------- Booking popup ----------
const selectedSkill = ref(null) // null = popup closed

function openBooking(skill) {
  selectedSkill.value = skill
}

function closeBooking() {
  selectedSkill.value = null
}

function book(slot) {
  if (slot.booked) return
  slot.booked = true
}

// Group the slots by date, so each day gets one row of times
const slotsByDate = computed(() => {
  const groups = {}
  if (!selectedSkill.value) return groups

  for (const slot of selectedSkill.value.slots) {
    if (!groups[slot.date]) groups[slot.date] = []
    groups[slot.date].push(slot)
  }
  return groups
})

function resetFilters() {
  selectedCategory.value = 'All'
  selectedRegion.value = 'All'
}

function goToInsights() {
  router.push('/insights')
}
</script>

<template>
  <nav class="navbar border-bottom px-3 justify-content-between">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <div class="d-flex align-items-center gap-3">
      <a href="#" class="text-decoration-none text-dark" @click.prevent="goToSessions">My sessions</a>
      <a href="#" class="text-decoration-none text-dark" @click.prevent="goToInsights">Insights</a>
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

    <!-- Search and filters -->
    <SkillSearch v-model="search" :skills="skills" />

    <div class="mb-2">
      <span class="me-2 small text-muted">Genre:</span>
      <span
        v-for="c in categories"
        :key="c"
        class="badge me-1"
        :class="selectedCategory === c ? 'text-bg-dark' : 'text-bg-light'"
        role="button"
        @click="selectedCategory = c"
      >
        <span v-if="c !== 'All'" class="dot" :style="{ background: categoryColors[c] }"></span>{{ c }}
      </span>
    </div>

    <div class="mb-2">
      <span class="me-2 small text-muted">Region:</span>
      <span
        v-for="r in regions"
        :key="r"
        class="badge me-1"
        :class="selectedRegion === r ? 'text-bg-dark' : 'text-bg-light'"
        role="button"
        @click="selectedRegion = r"
      >{{ r }}</span>
    </div>

    <p class="small mb-2">
      <a
        v-if="selectedCategory !== 'All' || selectedRegion !== 'All'"
        href="#"
        class="text-dark"
        @click.prevent="resetFilters"
      >Reset filters</a>
    </p>
    <p class="small mb-3">
      <a v-if="!userPos" href="#" class="text-dark" @click.prevent="findMe">Sort by distance from me</a>
      <template v-else>
        <span class="text-muted">You're in the {{ userRegion }} region. Closest first.</span>
        <a href="#" class="text-dark ms-2" @click.prevent="clearLocation">Clear</a>
      </template>
      <span v-if="locationError" class="ms-2 text-danger">{{ locationError }}</span>
    </p>

    <!-- On a phone the map shows first, then the list. On desktop they sit side by side. -->
    <div class="row g-3">
      <div class="col-lg-7 order-lg-2">
        <div ref="mapEl" class="map-box rounded border"></div>
      </div>

      <div class="col-lg-5 order-lg-1">
        <div class="list-pane">
          <div v-for="s in filteredSkills" :key="s.id" class="card mb-3">
            <div class="card-body">
              <div class="d-flex justify-content-between mb-2">
                <span class="badge text-bg-light">
                  <span class="dot" :style="{ background: categoryColors[s.category] }"></span>{{ s.category }}
                </span>
                <small v-if="s.distance !== null" class="text-muted">{{ s.distance.toFixed(1) }} km away</small>
              </div>
              <h2 class="h5">{{ s.skill }}</h2>
              <p class="text-muted mb-1">Taught by {{ s.teacher }}</p>
              <p class="text-muted small mb-3">Meets at {{ s.place }} ({{ s.region }})</p>
              <button class="btn btn-brand w-100" @click="openBooking(s)">Request session</button>
            </div>
          </div>

          <p v-if="filteredSkills.length === 0" class="text-muted">
            No skills match your filters. Try a different genre or region.
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Booking popup -->
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

          <p v-if="selectedSkill.slots.length === 0" class="text-muted">
            This coach has no available times yet.
          </p>
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

/* Small coloured dot for each genre */
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 5px;
}

.map-box {
  height: 400px;
}

.list-pane {
  max-height: 560px;
  overflow-y: auto;
}
</style>