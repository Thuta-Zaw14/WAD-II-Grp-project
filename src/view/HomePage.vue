<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { auth } from '../firebase'
import { useOffersStore } from '../stores/offers'
import { useProfileStore } from '../stores/profile'
import { useBookingsStore } from '../stores/bookings'
import SkillSearch from '../components/SkillSearch.vue'
import { matches } from '../searchUtils'

const router = useRouter()
const offersStore = useOffersStore()
const profileStore = useProfileStore()
const bookingsStore = useBookingsStore()
const user = ref(null)
const credits = computed(() => profileStore.credits)

// warnings an admin gave me (shown at the top of the page)
const warnings = computed(() => {
  const list = profileStore.profile ? profileStore.profile.warnings : []
  return Array.isArray(list) ? list : []
})

// ---------- Login ----------
function handleAuthChange(firebaseUser) {
  if (firebaseUser) {
    user.value = firebaseUser
    profileStore.fetchProfile()

    // only fetch if the store does not have the offers yet
    if (offersStore.offers.length === 0) {
      offersStore.fetchOffers()
    }
  } else {
    profileStore.reset()
    offersStore.reset() // each offer says which slots are "mine", so the next person must not see these
    bookingsStore.reset()
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

function goToProfile() {
  router.push('/profile')
}

// the public questions & discussion of a course (anyone can read and write there)
function openDiscussion(skill) {
  router.push('/discussion/' + skill.id)
}

// ---------- Skills (loaded from Firestore through the offers store) ----------
const skills = computed(() => offersStore.offers)

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
    const textMatches = matches(search.value, [item.title, item.skill, item.teacherName, item.category])
    const categoryMatches =
      selectedCategory.value === 'All' || item.category === selectedCategory.value
    const regionMatches = selectedRegion.value === 'All' || item.region === selectedRegion.value

    if (textMatches && categoryMatches && regionMatches) {
      // online classes have no pin, so they have no distance
      const hasPin = typeof item.lat === 'number' && typeof item.lng === 'number'
      const distance = userPos.value && hasPin ? distanceKm(userPos.value, item) : null
      results.push({ ...item, distance })
    }
  }

  // Closest first, once we know where you are
  if (userPos.value) {
    results.sort((a, b) => {
      if (a.distance === null) return 1 // online classes go last
      if (b.distance === null) return -1
      return a.distance - b.distance
    })
  }

  return results
})

// ---------- The map ----------
const mapEl = ref(null)
let map = null
let pinLayer = null

function drawPins() {
  if (!pinLayer) return // the map is not ready yet
  pinLayer.clearLayers()

  for (const s of filteredSkills.value) {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue // online class: no pin
    const pin = L.circleMarker([s.lat, s.lng], {
      radius: 10,
      color: 'white',
      fillColor: categoryColors[s.category],
      fillOpacity: 1,
    })
    pin.bindTooltip(s.title)
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
// Booking has two steps: click a start time to SELECT it, then press "Confirm booking".
// Nothing is saved until the second step.
const selectedId = ref(null) // id of the course in the popup (null = popup closed)
const chosenSlotId = ref('') // the start time that is selected but not confirmed yet
const bookedMessage = ref('') // shown after a booking worked

// Looked up from the store each time (not copied), so the seat counts update by themselves
const selectedSkill = computed(() => {
  for (const s of skills.value) {
    if (s.id === selectedId.value) return s
  }
  return null
})

const chosenSlot = computed(() => {
  if (!selectedSkill.value) return null
  for (const slot of selectedSkill.value.slots) {
    if (slot.id === chosenSlotId.value) return slot
  }
  return null
})

// is this my own course? (the server also refuses it)
function isMine(skill) {
  return user.value !== null && skill.teacherUid === user.value.uid
}

// have I booked one of this course's start times?
function hasBooked(skill) {
  for (const slot of skill.slots) {
    if (slot.mine) return true
  }
  return false
}

function openBooking(skill) {
  if (isMine(skill)) return
  selectedId.value = skill.id
  chosenSlotId.value = ''
  bookedMessage.value = ''
  bookingsStore.actionError = ''
}

function closeBooking() {
  selectedId.value = null
}

// Step 1: select a start time
function chooseSlot(slot) {
  if (slot.booked || slot.past || slot.mine || hasBooked(selectedSkill.value)) return
  chosenSlotId.value = slot.id
  bookingsStore.actionError = ''
}

// how a start time button looks
function slotClass(slot) {
  if (slot.mine) return 'btn-success'
  if (slot.id === chosenSlotId.value) return 'btn-dark'
  if (slot.booked || slot.past) return 'btn-outline-secondary'
  return 'btn-brand'
}

// the hover text that explains why a start time cannot be picked
function slotNote(slot) {
  if (slot.mine) return 'You booked this start time'
  if (slot.past) return 'This start time has already passed'
  if (slot.booked) return 'This start time is full'
  return ''
}

// Step 2: confirm
async function confirmBooking() {
  if (!chosenSlot.value) return
  const ok = await bookingsStore.book(selectedSkill.value.id, chosenSlot.value.id)
  if (ok) {
    chosenSlotId.value = ''
    bookedMessage.value = 'Booked! ' + selectedSkill.value.creditCost + ' credit(s) are held until the course is finished.'
  }
}

// "Sat, 8 Nov, 14:00" in Singapore time
function formatTime(iso) {
  return new Date(iso).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  <nav class="navbar border-bottom px-3">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <div class="d-flex align-items-center gap-3">
      <a href="#" class="text-decoration-none text-dark" @click.prevent="goToSessions">My sessions</a>
      <a href="#" class="text-decoration-none text-dark" @click.prevent="goToProfile">Profile</a>
      <a href="#" class="text-decoration-none text-dark" @click.prevent="goToInsights">Insights</a>
      <small v-if="user" class="text-muted d-none d-md-inline">{{ user.email }}</small>
      <button class="btn btn-sm" @click="logout">Log out</button>
    </div>
  </nav>

  <div class="container py-4">
    <!-- e.g. "Your account has been suspended." for a banned person -->
    <div v-if="profileStore.error" class="alert alert-danger">{{ profileStore.error }}</div>

    <div v-if="warnings.length > 0" class="alert alert-warning">
      <strong>{{ warnings.length === 1 ? 'You have a warning' : 'You have ' + warnings.length + ' warnings' }} from the Kongsi team.</strong>
      <ul class="mb-0 mt-1">
        <li v-for="(w, i) in warnings" :key="i">{{ w.reason }}</li>
      </ul>
    </div>

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
                <span v-if="hasBooked(s)" class="badge text-bg-success">Booked</span>
                <small v-else-if="s.distance !== null" class="text-muted">{{ s.distance.toFixed(1) }} km away</small>
              </div>
              <h2 class="h5">{{ s.title }}</h2>
              <p class="text-muted mb-1">Taught by {{ s.teacherName }}</p>
              <p v-if="s.mode === 'online'" class="text-muted small mb-1">Online class</p>
              <p v-else class="text-muted small mb-1">Meets at {{ s.place }} ({{ s.region }})</p>
              <p class="small mb-3">{{ s.creditCost }} credit{{ s.creditCost === 1 ? '' : 's' }} to join</p>
              <button v-if="isMine(s)" class="btn btn-outline-secondary w-100" disabled>Your course</button>
              <button v-else class="btn btn-brand w-100" @click="openBooking(s)">
                {{ hasBooked(s) ? 'View booking' : 'Book a session' }}
              </button>
              <button class="btn btn-sm btn-outline-secondary w-100 mt-2" @click="openDiscussion(s)">
                Questions &amp; discussion
              </button>
            </div>
          </div>

          <p v-if="offersStore.loading" class="text-muted">Loading skills...</p>
          <p v-else-if="offersStore.error" class="text-danger">{{ offersStore.error }}</p>
          <p v-else-if="filteredSkills.length === 0" class="text-muted">
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
            <h2 class="h5 mb-0">{{ selectedSkill.title }}</h2>
            <small>Coach: {{ selectedSkill.teacherName }}</small>
          </div>
          <button class="btn-close" @click="closeBooking"></button>
        </div>

        <div class="modal-body">
          <!-- after a booking worked -->
          <div v-if="bookedMessage">
            <div class="alert alert-success">{{ bookedMessage }}</div>
            <p class="small text-muted">
              You will find it under My sessions, where you can cancel it while that is still allowed.
            </p>
            <button class="btn btn-brand me-2" @click="goToSessions">Go to My sessions</button>
            <button class="btn btn-outline-secondary" @click="closeBooking">Close</button>
          </div>

          <template v-else>
            <p v-if="hasBooked(selectedSkill)" class="alert alert-info small">
              You have already booked this course. See My sessions.
            </p>
            <p v-else class="text-muted">Pick a time, then confirm your booking.</p>

            <p class="small text-muted">
              {{ selectedSkill.durationWeeks }} week{{ selectedSkill.durationWeeks === 1 ? '' : 's' }},
              {{ selectedSkill.lessonsPerWeek }} lesson{{ selectedSkill.lessonsPerWeek === 1 ? '' : 's' }} a week.
              One booking covers the whole course.
            </p>

            <!-- Step 1: select a start time -->
            <div v-for="(daySlots, date) in slotsByDate" :key="date" class="mb-3">
              <div class="fw-bold mb-2">{{ date }}</div>
              <div class="d-flex flex-wrap gap-2">
                <button
                  v-for="slot in daySlots"
                  :key="slot.id"
                  class="btn btn-sm"
                  :class="slotClass(slot)"
                  :disabled="slot.booked || slot.past || slot.mine || hasBooked(selectedSkill)"
                  :title="slotNote(slot)"
                  @click="chooseSlot(slot)"
                >
                  {{ slot.time }}
                  <small v-if="slot.mine">(yours)</small>
                  <small v-else-if="slot.past">(started)</small>
                  <small v-else-if="slot.booked">(full)</small>
                  <small v-else>({{ slot.spotsLeft }} left)</small>
                </button>
              </div>
            </div>

            <p v-if="selectedSkill.slots.length === 0" class="text-muted">
              This coach has no available times yet.
            </p>

            <!-- Step 2: confirm -->
            <div v-if="chosenSlot" class="border rounded p-3 mt-3">
              <p class="fw-semibold mb-1">{{ selectedSkill.title }}: starts {{ chosenSlot.date }} at {{ chosenSlot.time }}</p>
              <p class="small mb-1">
                Cost: <strong>{{ selectedSkill.creditCost }} credit{{ selectedSkill.creditCost === 1 ? '' : 's' }}</strong>
                (you have {{ credits }}). The credit is held until you and the teacher both mark the course finished.
              </p>
              <p v-if="chosenSlot.cancellable" class="small text-muted mb-2">
                You can cancel for a full refund until {{ formatTime(chosenSlot.cancelBefore) }}.
              </p>
              <p v-else class="small text-danger mb-2">
                This starts in less than 24 hours, so once booked it cannot be cancelled.
              </p>
              <p v-if="credits < selectedSkill.creditCost" class="small text-danger mb-2">
                You do not have enough credits. Teach a course to earn some.
              </p>
              <p v-if="bookingsStore.actionError" class="small text-danger mb-2">{{ bookingsStore.actionError }}</p>

              <button
                class="btn btn-brand me-2"
                :disabled="bookingsStore.booking || credits < selectedSkill.creditCost"
                @click="confirmBooking"
              >
                {{ bookingsStore.booking ? 'Booking...' : 'Confirm booking' }}
              </button>
              <button class="btn btn-outline-secondary" @click="chosenSlotId = ''">Choose another time</button>
            </div>

            <p v-else-if="bookingsStore.actionError" class="small text-danger mt-2">{{ bookingsStore.actionError }}</p>
          </template>
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