<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { auth } from '../firebase'
import { useOffersStore } from '../stores/offers'
import { useProfileStore } from '../stores/profile'
import { useBookingsStore } from '../stores/bookings'
import SkillSearch from '../components/SkillSearch.vue'
import NavBar from '../components/NavBar.vue'
import UserAvatar from '../components/UserAvatar.vue'
import LoadingText from '../components/LoadingText.vue'
import EmptyState from '../components/EmptyState.vue'
import heroImg from '../assets/login.jpg'
import { matches } from '../searchUtils'

const router = useRouter()
const offersStore = useOffersStore()
const profileStore = useProfileStore()
const bookingsStore = useBookingsStore()
const user = ref(null)
const credits = computed(() => profileStore.credits)

// "Bob" from "Bob Lim", for the greeting ('' until the profile has a name)
const firstName = computed(() => {
  const name = profileStore.profile ? profileStore.profile.name || '' : ''
  return name.trim().split(' ')[0]
})

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
    router.push('/')
  }
}

const stopListening = onAuthStateChanged(auth, handleAuthChange)

function goToSessions() {
  router.push('/classes')
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
const locating = ref(false) // waiting for the browser to say where you are
let youMarker = null

// Work out the region from coordinates (rough cut-offs, not official borders).
// The server gives each course its region with the same cut-offs (regionOfPoint in
// server/config/skills.js), so change both together.
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

// OUTSIDE THE SLIDES: navigator.geolocation is a browser feature the slides do not cover.
// The browser asks the person for permission first.
function findMe() {
  locationError.value = ''
  if (!navigator.geolocation) {
    locationError.value = 'Your browser cannot share your location.'
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      if (!map) return // the answer came after the person left this page
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      userPos.value = { lat, lng }
      userRegion.value = getRegion(lat, lng)

      if (youMarker) youMarker.remove()
      youMarker = L.circleMarker([lat, lng], { radius: 8, color: 'blue' }).addTo(map)
    },
    () => {
      locating.value = false
      locationError.value = 'Could not get your location. Allow location access in your browser.'
    }
  )
}

function clearLocation() {
  userPos.value = null
  userRegion.value = ''
  if (youMarker) youMarker.remove()
  youMarker = null
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

// Courses that meet at the same place share one pin. A course saved before the meeting place
// was picked on a map only has a rough pin somewhere in its region, so it is drawn paler.
// -> [{ lat, lng, exact, place, address, courses: [...] }]
const pinGroups = computed(() => {
  const groups = []
  for (const s of filteredSkills.value) {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue // online class: no pin
    let group = null
    for (const g of groups) {
      if (g.lat === s.lat && g.lng === s.lng) group = g
    }
    if (group === null) {
      group = { lat: s.lat, lng: s.lng, exact: s.placeVerified === true, place: s.place, address: s.address || '', courses: [] }
      groups.push(group)
    }
    group.courses.push(s)
  }
  return groups
})

// Leaflet reads a plain text tooltip as HTML, so the words go into an element instead.
// That way a course title such as "<img ...>" is only ever shown, never run.
function tooltipText(words) {
  const span = document.createElement('span')
  span.textContent = words
  return span
}

function drawPins() {
  if (!pinLayer) return // the map is not ready yet
  pinLayer.clearLayers()

  for (const group of pinGroups.value) {
    const first = group.courses[0]
    let pin = null
    if (group.courses.length === 1) {
      pin = L.circleMarker([group.lat, group.lng], {
        radius: 10,
        color: 'white',
        fillColor: categoryColors[first.category],
        fillOpacity: group.exact ? 1 : 0.45,
      })
      pin.bindTooltip(tooltipText(first.title + (group.exact ? '' : ' (rough area only)')))
      pin.on('click', () => openBooking(first)) // clicking a pin opens the booking popup
    } else {
      // several courses meet here: one pin with the number, which lists them
      pin = L.marker([group.lat, group.lng], {
        icon: L.divIcon({ className: 'place-pin', html: '<span>' + group.courses.length + '</span>', iconSize: [30, 30] }),
        keyboard: false,
      })
      pin.bindTooltip(tooltipText(group.courses.length + ' courses at ' + group.place))
      pin.on('click', () => openPlace(group))
    }
    pin.addTo(pinLayer)
  }
}

// Redraw the pins whenever the list changes
watch(pinGroups, drawPins)

// ---------- Several courses at one place (popup) ----------
const placeKey = ref('') // "lat,lng" of the place whose courses are listed ('' = popup closed)

const placeGroup = computed(() => {
  for (const g of pinGroups.value) {
    if (g.lat + ',' + g.lng === placeKey.value) return g
  }
  return null
})

function openPlace(group) {
  placeKey.value = group.lat + ',' + group.lng
}

function closePlace() {
  placeKey.value = ''
}

function bookFromPlace(skill) {
  closePlace()
  openBooking(skill)
}

function detailsFromPlace(skill) {
  closePlace()
  openDetails(skill)
}

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
  if (map) map.remove()
  map = null
  pinLayer = null // drawPins stops here if the list changes after the page is gone
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
  return user.value !== null && skill.isMine === true
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
  if (slot.id === chosenSlotId.value) return 'btn-accent'
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

// ---------- Details popup ----------
const detailsId = ref(null) // id of the course in the details popup (null = popup closed)

const detailsSkill = computed(() => {
  for (const s of skills.value) {
    if (s.id === detailsId.value) return s
  }
  return null
})

function openDetails(skill) {
  detailsId.value = skill.id
}

function closeDetails() {
  detailsId.value = null
}

// from the details popup straight into booking
function bookFromDetails() {
  const skill = detailsSkill.value
  closeDetails()
  openBooking(skill)
}

function resetFilters() {
  selectedCategory.value = 'All'
  selectedRegion.value = 'All'
  search.value = ''
}
</script>

<template>
  <NavBar />

  <div class="container py-4">
    <!-- e.g. "Your account has been suspended." for a banned person -->
    <div v-if="profileStore.error" class="alert alert-danger">{{ profileStore.error }}</div>

    <div v-if="warnings.length > 0" class="alert alert-warning">
      <strong>{{ warnings.length === 1 ? 'You have a warning' : 'You have ' + warnings.length + ' warnings' }} from the Kongsi team.</strong>
      <ul class="mb-0 mt-1">
        <li v-for="(w, i) in warnings" :key="i">{{ w.reason }}</li>
      </ul>
    </div>

    <!-- Welcome box, with one main button. The photo is only shown on wider screens. -->
    <section class="hero mb-4">
      <div class="hero-text">
        <p class="eyebrow mb-2">Kongsi skill exchange</p>
        <h1 class="mb-2">Find your next course{{ firstName ? ', ' + firstName : '' }}</h1>
        <p class="mb-3">Search, filter by genre or region, or pick a pin on the map.</p>
        <div class="d-flex align-items-center flex-wrap gap-3">
          <button class="btn btn-brand px-4" @click="router.push('/teach/new')">Teach a skill</button>
          <span class="credit-pill">You have {{ credits }} time credit{{ credits === 1 ? '' : 's' }}</span>
        </div>
      </div>
      <img :src="heroImg" alt="" class="hero-photo d-none d-md-block" />
    </section>

    <!-- Search and filters -->
    <div class="k-card p-3 mb-4">
      <SkillSearch v-model="search" :skills="skills" />

      <div class="d-flex align-items-center flex-wrap gap-2 mb-2">
        <span class="small text-muted filter-label">Genre</span>
        <button
          v-for="c in categories"
          :key="c"
          type="button"
          class="filter"
          :class="{ active: selectedCategory === c }"
          @click="selectedCategory = c"
        >
          <span v-if="c !== 'All'" class="dot" :style="{ background: categoryColors[c] }"></span>{{ c }}
        </button>
      </div>

      <div class="d-flex align-items-center flex-wrap gap-2 mb-2">
        <span class="small text-muted filter-label">Region</span>
        <button
          v-for="r in regions"
          :key="r"
          type="button"
          class="filter"
          :class="{ active: selectedRegion === r }"
          @click="selectedRegion = r"
        >{{ r }}</button>
      </div>

      <!-- Sort by distance: a pill like the filters above; dark brown while it is on -->
      <div class="d-flex align-items-center flex-wrap gap-2">
        <span class="small text-muted filter-label">Sort</span>
        <button
          v-if="!userPos"
          type="button"
          class="filter near-me"
          :disabled="locating"
          @click="findMe"
        >
          <svg class="pin" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
          </svg>
          {{ locating ? 'Finding you...' : 'Sort by distance' }}
        </button>
        <button
          v-else
          type="button"
          class="filter near-me active"
          aria-label="Stop sorting by distance"
          @click="clearLocation"
        >
          <svg class="pin" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
          </svg>
          Closest first &middot; {{ userRegion }} region
          <span class="near-me-clear" aria-hidden="true">&times;</span>
        </button>
        <a
          v-if="selectedCategory !== 'All' || selectedRegion !== 'All'"
          href="#"
          class="small ms-2"
          @click.prevent="resetFilters"
        >Reset filters</a>
      </div>
      <p v-if="locationError" class="small text-danger mt-2 mb-0">{{ locationError }}</p>
    </div>

    <!-- On a phone the map shows first, then the list. On desktop they sit side by side. -->
    <div class="row g-3">
      <div class="col-lg-7 order-lg-2">
        <div ref="mapEl" class="map-box"></div>
      </div>

      <div class="col-lg-5 order-lg-1">
        <div class="list-pane">
          <div
            v-for="s in filteredSkills"
            :key="s.id"
            class="card genre-card k-lift mb-3"
            :class="'cat-' + s.category"
          >
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge rounded-pill text-bg-light">
                  <span class="dot" :style="{ background: categoryColors[s.category] }"></span>{{ s.category }}
                </span>
                <span v-if="hasBooked(s)" class="badge rounded-pill text-bg-success">Booked</span>
                <small v-else-if="s.distance !== null" class="text-muted">{{ s.distance.toFixed(1) }} km away</small>
              </div>

              <h2 class="h5 mb-2">{{ s.title }}</h2>
              <div class="d-flex align-items-center gap-2 mb-2">
                <UserAvatar :name="s.teacherName" />
                <span class="text-muted">Taught by {{ s.teacherName }}</span>
              </div>
              <p v-if="s.mode === 'online'" class="text-muted small mb-2">💻 Online class</p>
              <p v-else class="text-muted small mb-2">📍 Meets at {{ s.place }} ({{ s.region }})</p>
              <p class="mb-3">
                <span class="credit-pill">{{ s.creditCost }} credit{{ s.creditCost === 1 ? '' : 's' }} to join</span>
              </p>

              <button class="btn btn-outline-secondary w-100 mb-2" @click="openDetails(s)">Details</button>
              <button v-if="isMine(s)" class="btn btn-outline-secondary w-100" disabled>Your course</button>
              <button v-else class="btn btn-brand w-100" @click="openBooking(s)">
                {{ hasBooked(s) ? 'View booking' : 'Book a session' }}
              </button>
              <button class="btn btn-sm btn-outline-secondary w-100 mt-2" @click="openDiscussion(s)">
                Questions &amp; discussion
              </button>
            </div>
          </div>

          <LoadingText v-if="offersStore.loading" text="Loading skills..." />
          <p v-else-if="offersStore.error" class="text-danger">{{ offersStore.error }}</p>
          <EmptyState
            v-else-if="skills.length === 0"
            icon="🌱"
            title="No courses yet"
            text="Be the first to teach something and earn credits."
          >
            <button class="btn btn-brand btn-sm" @click="router.push('/teach/new')">Teach a skill</button>
          </EmptyState>
          <EmptyState
            v-else-if="filteredSkills.length === 0"
            icon="🔍"
            title="No skills match your filters"
            text="Try a different genre or region, or clear the search."
          >
            <button class="btn btn-outline-secondary btn-sm" @click="resetFilters">Clear search and filters</button>
          </EmptyState>
        </div>
      </div>
    </div>
  </div>

  <!-- Details popup -->
  <div
    v-if="detailsSkill"
    class="modal d-block"
    style="background: rgba(0, 0, 0, 0.5)"
    @click.self="closeDetails"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header modal-banner">
          <div>
            <h2 class="h5 mb-1">{{ detailsSkill.title }}</h2>
            <span class="badge rounded-pill text-bg-light">
              <span class="dot" :style="{ background: categoryColors[detailsSkill.category] }"></span>{{ detailsSkill.skill }}
            </span>
          </div>
          <button class="btn-close" @click="closeDetails"></button>
        </div>

        <div class="modal-body">
          <p v-if="detailsSkill.description" class="details-description">{{ detailsSkill.description }}</p>

          <div v-if="detailsSkill.mode === 'physical'" class="mb-3">
            <div class="fw-bold mb-1">Where</div>
            <p class="mb-0">{{ detailsSkill.place }}</p>
            <p v-if="detailsSkill.address" class="small text-muted mb-0">{{ detailsSkill.address }}</p>
            <p v-else class="small text-muted mb-0">{{ detailsSkill.region }} region. Its pin on the map only shows the rough area.</p>
          </div>

          <div class="fw-bold mb-2">Stages</div>
          <!-- hover (or tab to) a stage to read its description -->
          <div v-if="detailsSkill.stages && detailsSkill.stages.length > 0" class="d-flex flex-column gap-2">
            <div
              v-for="(stage, i) in detailsSkill.stages"
              :key="i"
              class="stage-box"
              :class="{ 'has-desc': stage.description }"
              :tabindex="stage.description ? 0 : -1"
            >
              <span class="stage-num">{{ i + 1 }}</span>{{ stage.name }}
              <p v-if="stage.description" class="stage-desc small mb-0">{{ stage.description }}</p>
            </div>
          </div>
          <p v-else class="text-muted small mb-0">This course has no stages listed.</p>
        </div>

        <div v-if="!isMine(detailsSkill)" class="modal-footer">
          <button class="btn btn-brand" @click="bookFromDetails">
            {{ hasBooked(detailsSkill) ? 'View booking' : 'Book a session' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Several courses at one place: opened from a pin with a number -->
  <div
    v-if="placeGroup"
    class="modal d-block"
    style="background: rgba(0, 0, 0, 0.5)"
    @click.self="closePlace"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header modal-banner">
          <div class="min-w-0">
            <h2 class="h5 mb-1">{{ placeGroup.place }}</h2>
            <small v-if="placeGroup.address">{{ placeGroup.address }}</small>
          </div>
          <button class="btn-close" aria-label="Close" @click="closePlace"></button>
        </div>

        <div class="modal-body">
          <p class="small text-muted">{{ placeGroup.courses.length }} courses meet here.</p>
          <div
            v-for="s in placeGroup.courses"
            :key="s.id"
            class="place-course d-flex justify-content-between align-items-center flex-wrap gap-2"
          >
            <div class="min-w-0">
              <strong class="d-block">{{ s.title }}</strong>
              <small class="text-muted">
                Taught by {{ s.teacherName }} &middot; {{ s.creditCost }} credit{{ s.creditCost === 1 ? '' : 's' }}
              </small>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-secondary" @click="detailsFromPlace(s)">Details</button>
              <button v-if="isMine(s)" class="btn btn-sm btn-outline-secondary" disabled>Your course</button>
              <button v-else class="btn btn-sm btn-brand" @click="bookFromPlace(s)">
                {{ hasBooked(s) ? 'View booking' : 'Book' }}
              </button>
            </div>
          </div>
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
        <div class="modal-header modal-banner">
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
              You will find it under My classes, where you can cancel it while that is still allowed.
            </p>
            <button class="btn btn-brand me-2" @click="goToSessions">Go to My classes</button>
            <button class="btn btn-outline-secondary" @click="closeBooking">Close</button>
          </div>

          <template v-else>
            <p v-if="hasBooked(selectedSkill)" class="alert alert-info small">
              You have already booked this course. See My classes.
            </p>
            <p v-else class="text-muted">Pick a time, then confirm your booking.</p>

            <p class="small text-muted">
              {{ selectedSkill.durationWeeks }} week{{ selectedSkill.durationWeeks === 1 ? '' : 's' }},
              {{ selectedSkill.lessonsPerWeek }} lesson{{ selectedSkill.lessonsPerWeek === 1 ? '' : 's' }} a week.
              {{ selectedSkill.sessionDurationMinutes || 60 }} minutes per session.
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
                This starts in less than 24 hours, so if you cancel after booking your credits go to the teacher.
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
.hero {
  position: relative;
  overflow: hidden;
  background: var(--k-surface-alt);
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius);
}

.hero-text {
  padding: 2rem;
}

.hero h1 {
  font-size: 2rem;
  color: var(--k-accent);
}

/* The photo fills the right part of the box and fades into it on its left side.
   (It is hidden on a phone, so the text gets the whole width there.) */
@media (min-width: 768px) {
  .hero-text {
    padding-right: 42%;
  }
}

.hero-photo {
  position: absolute;
  top: 0;
  right: 0;
  width: 40%;
  height: 100%;
  object-fit: cover;
  -webkit-mask-image: linear-gradient(to right, transparent, black 45%);
  mask-image: linear-gradient(to right, transparent, black 45%);
}

.filter-label {
  width: 52px;
}

/* the genre and region buttons */
.filter {
  padding: 4px 14px;
  border: 1px solid var(--k-border);
  border-radius: 999px;
  background: var(--k-surface);
  color: var(--k-text);
  font-size: 13px;
  font-weight: 600;
}

.filter:hover {
  border-color: var(--k-brand);
}

.filter.active {
  background: var(--k-accent);
  border-color: var(--k-accent);
  color: var(--k-on-accent);
}

/* the "Sort by distance" pill: light brown with a map pin, dark brown (.active) while on */
.near-me {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--k-brand-soft);
  border-color: var(--k-brand);
  color: var(--k-accent);
}

.near-me:disabled {
  opacity: 0.7;
  cursor: progress;
}

.pin {
  width: 14px;
  height: 14px;
  fill: currentColor;
  flex-shrink: 0;
}

.near-me-clear {
  margin-left: 2px;
  font-size: 15px;
  line-height: 1;
  opacity: 0.8;
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
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius);
  overflow: hidden;
}

/* A pin with a number: several courses meet at this place. Leaflet makes this element itself,
   so it does not get this page's scoped mark, and :deep() is needed to reach it. */
.map-box :deep(.place-pin) {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  border-radius: 50%;
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

/* one course in the "courses at this place" popup */
.place-course {
  padding: 10px 0;
  border-top: 1px solid var(--k-border);
}

.min-w-0 {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* the padding leaves room for a card to rise without being cut off */
.list-pane {
  max-height: 560px;
  overflow-y: auto;
  padding: 6px 6px 0 2px;
}

.modal-banner {
  background: var(--k-surface-alt);
  color: var(--k-text);
}

.details-description {
  white-space: pre-line; /* keep the teacher's line breaks */
}

/* one small box per course stage */
.stage-box {
  padding: 6px 12px;
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius);
  background: var(--k-surface-alt);
  font-size: 14px;
  font-weight: 600;
}

.stage-num {
  color: var(--k-accent);
  margin-right: 6px;
}

/* the description is hidden until the box is hovered (or focused with the keyboard) */
.stage-desc {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  font-weight: 400;
  color: var(--k-text);
  transition: max-height 0.2s ease, opacity 0.2s ease, margin-top 0.2s ease;
}

.stage-box.has-desc {
  cursor: default;
}

/* each stage has its own row, so hovering only opens the description underneath */
.stage-box.has-desc:hover,
.stage-box.has-desc:focus {
  border-color: var(--k-brand);
  outline: none;
}

.stage-box.has-desc:hover .stage-desc,
.stage-box.has-desc:focus .stage-desc {
  max-height: 200px;
  opacity: 1;
  margin-top: 6px;
}
</style>
