<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { searchPlaces, errorText } from '../services/api'

// The meeting place of a physical class (used on the teach form). Type a postal code, building
// or street, then pick a result from the list or click its pin on the map. Only places that came
// back from the search can be picked, and the server checks the place again when the course is saved.
// v-model = the picked place { name, address, postal, lat, lng, region }, or null
const props = defineProps({
  modelValue: { type: Object, default: null },
  inputId: { type: String, default: 'place-search' },
  error: { type: String, default: '' },
  oldPlace: { type: String, default: '' }, // a place typed by hand before the map search existed
})
const emit = defineEmits(['update:modelValue', 'leave'])

// pins are drawn by Leaflet, which cannot read the CSS colours, so these are copies from theme.css
const BRAND = '#9a6a44' // --k-brand
const MUTED = '#766b5c' // --k-muted

// ---------- The search box ----------
const text = ref(props.oldPlace) // an old course starts with its typed place, ready to search
const results = ref([])
const open = ref(false) // is the list of results showing?
const searching = ref(false)
const searchError = ref('')
const active = ref(-1) // the result picked with the arrow keys
let timer = null
let lastAsked = '' // only the answer to the newest search is shown

function onInput() {
  active.value = -1
  searchError.value = ''
  clearTimeout(timer)
  const typed = text.value.trim()
  if (typed.length < 2) {
    results.value = []
    open.value = false
    drawResultPins()
    return
  }
  // wait until they stop typing for a moment before asking the server
  timer = setTimeout(() => runSearch(typed), 300)
}

// coming back to a box that already has text in it (e.g. an old course's place) searches it
function onFocus() {
  const typed = text.value.trim()
  if (!open.value && typed.length >= 2) runSearch(typed)
}

async function runSearch(typed) {
  lastAsked = typed
  searching.value = true
  open.value = true
  try {
    const found = await searchPlaces(typed)
    if (typed !== lastAsked) return
    results.value = found
  } catch (err) {
    if (typed !== lastAsked) return
    results.value = []
    searchError.value = errorText(err)
  }
  searching.value = false
  drawResultPins()
}

function pick(place) {
  emit('update:modelValue', place)
  text.value = ''
  results.value = []
  open.value = false
  active.value = -1
  drawResultPins()
}

// arrow keys move through the list, Enter picks, Escape closes it
function onKey(event) {
  if (event.key === 'Escape') {
    open.value = false
    return
  }
  if (!open.value || results.value.length === 0) {
    if (event.key === 'Enter') event.preventDefault() // Enter here must not send the whole form
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % results.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = active.value <= 0 ? results.value.length - 1 : active.value - 1
  } else if (event.key === 'Enter') {
    event.preventDefault()
    pick(results.value[active.value >= 0 ? active.value : 0])
  }
}

// Leaving the box closes the list, unless the click went to the map (its pins pick a place
// too). relatedTarget is the element that gets the focus next (null when nothing does).
const pickerEl = ref(null)
function onBlur(event) {
  if (event.relatedTarget && pickerEl.value && pickerEl.value.contains(event.relatedTarget)) return
  open.value = false
  emit('leave')
}

// ---------- The map ----------
const mapEl = ref(null)
let map = null
let resultLayer = null // grey pins: the search results
let chosenPin = null // the brown pin: the place that is picked

// Leaflet reads a plain text tooltip as HTML, so the words go into an element instead
// (then a name can only ever be shown, never run)
function tooltipText(words) {
  const span = document.createElement('span')
  span.textContent = words
  return span
}

// the search results as pins; clicking one picks it
function drawResultPins() {
  if (!resultLayer) return // the map is not ready yet
  resultLayer.clearLayers()
  const corners = []
  for (const place of results.value) {
    const pin = L.circleMarker([place.lat, place.lng], {
      radius: 8,
      color: 'white',
      weight: 2,
      fillColor: MUTED,
      fillOpacity: 1,
    })
    pin.bindTooltip(tooltipText(place.name))
    pin.on('click', () => pick(place))
    pin.addTo(resultLayer)
    corners.push([place.lat, place.lng])
  }
  // Show all the results at once. animate: false jumps straight there: a zoom that is still
  // moving when the page is left (e.g. the teacher saves at once) makes Leaflet throw an error.
  if (corners.length > 0) map.fitBounds(corners, { padding: [30, 30], maxZoom: 16, animate: false })
}

function drawChosen() {
  if (!map) return
  if (chosenPin) {
    chosenPin.remove()
    chosenPin = null
  }
  const place = props.modelValue
  if (!place) return
  chosenPin = L.circleMarker([place.lat, place.lng], {
    radius: 11,
    color: 'white',
    weight: 3,
    fillColor: BRAND,
    fillOpacity: 1,
  })
  chosenPin.bindTooltip(tooltipText(place.name))
  chosenPin.addTo(map)
  map.setView([place.lat, place.lng], 16, { animate: false })
}

watch(() => props.modelValue, drawChosen)

onMounted(() => {
  // the page scrolls past the map, so the mouse wheel does not zoom it (the + and - buttons do)
  map = L.map(mapEl.value, { scrollWheelZoom: false }).setView([1.3521, 103.8198], 11) // middle of Singapore
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  resultLayer = L.layerGroup().addTo(map)
  drawChosen()
})

onUnmounted(() => {
  clearTimeout(timer)
  if (map) map.remove()
  map = null
  resultLayer = null
  chosenPin = null
})
</script>

<template>
  <div ref="pickerEl" class="place-picker">
    <label :for="inputId" class="form-label">Meeting place <span class="required-marker" aria-hidden="true">*</span></label>

    <p v-if="oldPlace && !modelValue" class="small text-muted mb-2">
      This course was saved with a place typed by hand ("{{ oldPlace }}"). Search for it and pick it from
      the list, so students get an exact pin.
    </p>

    <div>
      <input
        :id="inputId"
        v-model="text"
        type="text"
        class="form-control"
        :class="{ 'is-invalid': error }"
        :placeholder="modelValue ? 'Search for a different place' : 'Postal code, building or street, e.g. 579841 or Bishan Library'"
        maxlength="60"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-controls="inputId + '-list'"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-activedescendant="active >= 0 ? inputId + '-option-' + active : undefined"
        :aria-invalid="!!error"
        :aria-describedby="error ? inputId + '-error' : inputId + '-help'"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKey"
        @blur="onBlur"
      />
      <ul v-show="open" :id="inputId + '-list'" class="search-results" role="listbox">
        <li v-if="searching" class="search-note">Searching...</li>
        <li v-else-if="searchError" class="search-note text-danger">{{ searchError }}</li>
        <li v-else-if="results.length === 0" class="search-note">No places in Singapore match "{{ text.trim() }}".</li>
        <li
          v-for="(place, index) in searching ? [] : results"
          :id="inputId + '-option-' + index"
          :key="place.name + place.address"
          class="search-option"
          :class="{ active: index === active }"
          role="option"
          :aria-selected="index === active ? 'true' : 'false'"
          @mousedown.prevent="pick(place)"
        >
          <span class="d-block">{{ place.name }}</span>
          <small class="text-muted">{{ place.address }}</small>
        </li>
      </ul>
    </div>
    <div v-if="error" :id="inputId + '-error'" class="invalid-feedback d-block">{{ error }}</div>

    <!-- the place that is picked -->
    <div v-if="modelValue" class="chosen mt-2">
      <span aria-hidden="true">📍</span>
      <div class="min-w-0">
        <strong class="d-block">{{ modelValue.name }}</strong>
        <small class="d-block text-muted">{{ modelValue.address }}</small>
        <small class="text-muted">{{ modelValue.region }} region</small>
      </div>
    </div>

    <div ref="mapEl" class="picker-map mt-2"></div>
    <small :id="inputId + '-help'" class="text-muted d-block mt-1">
      Pick a result from the list or click its pin on the map. Everyone who can see the course sees this
      address, so a public place such as a library or community club is best.
    </small>
  </div>
</template>

<style scoped>
/* The colours come from src/assets/theme.css */
.required-marker {
  color: #dc3545;
  font-weight: 700;
}

/* The results sit under the box and push the map down (they do not cover it), so the
   pins of the results stay visible and can be clicked */
.search-results {
  max-height: 220px;
  overflow-y: auto;
  margin: 4px 0 0;
  padding: 4px;
  list-style: none;
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  border-radius: 10px;
  box-shadow: var(--k-shadow-lift);
}

.search-option {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.search-option:hover,
.search-option.active {
  background: var(--k-surface-alt);
}

.search-note {
  padding: 8px 10px;
  color: var(--k-muted);
  font-size: 0.875rem;
}

.chosen {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--k-border);
  border-radius: 10px;
  background: var(--k-surface-alt);
}

.min-w-0 {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* z-index 0 keeps the map's own layers (z-index 400 and up) under the sticky top bar */
.picker-map {
  position: relative;
  z-index: 0;
  height: 240px;
  border: 1px solid var(--k-border);
  border-radius: 10px;
}
</style>
