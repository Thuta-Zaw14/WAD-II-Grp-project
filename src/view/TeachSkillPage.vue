<script setup>
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '@/firebase'
import { useProfileStore } from '@/stores/profile'
import { createOffer, updateOffer, deleteOffer, errorText } from '@/services/api'
import { calcCreditCost, MAX_STAGES } from '@/services/credits'
import { uploadPending, deleteMany } from '@/services/storage'
import SkillsBasicsField from '@/components/SkillsBasicsField.vue'
import MediaPicker from '@/components/MediaPicker.vue'
import PlacePicker from '@/components/PlacePicker.vue'
import { picturesEnabled } from '@/config'
import { findTitleProblem } from '@/services/skillRules'
import NavBar from '@/components/NavBar.vue'
import LoadingText from '@/components/LoadingText.vue'
import { useToastStore } from '@/stores/toast'

// The address /teach/:id gives us the id of the course being edited (none = a new course)
const props = defineProps({ id: { type: String, default: null } })
const router = useRouter()
const store = useProfileStore()
const toast = useToastStore()
const isEdit = computed(() => !!props.id)

let uid = null
let keyCounter = 0 // gives every stage a stable key for v-for

const newStage = (s = {}) => ({
  key: ++keyCounter,
  name: s.name || '',
  description: s.description || '',
  media: s.media ? [...s.media] : [],
})

// ---------- The form ----------
const skill = ref('') // one of the names in the profile's "skills I can teach"
const title = ref('')
const description = ref('')
const media = ref([])
const mode = ref('physical')
const meetingPlace = ref(null) // the meeting place picked in the map search (PlacePicker.vue)
const oldPlace = ref('') // an older course's place, typed by hand before the map search existed
const equipmentOption = ref('not_required')
const difficulty = ref('standard')
const maxCapacity = ref(5)
const durationWeeks = ref(4)
const lessonsPerWeek = ref(1)
const sessionDurationMinutes = ref(60)
const stages = ref([newStage()])
const slots = ref([]) // [{ date, time, taken }]  taken = students already booked (edit only)

// the little "add a start time" row
const slotDate = ref('')
const slotTime = ref('')

const original = ref(null) // the saved course when editing

const loading = ref(true)
const blocked = ref(false)
const saving = ref(false)
const error = ref('')
const summaryError = ref('')
const submitAttempted = ref(false)
const fieldErrors = reactive({
  skill: '',
  title: '',
  location: '',
  maxCapacity: '',
  durationWeeks: '',
  lessonsPerWeek: '',
  sessionDurationMinutes: '',
  slotDate: '',
  slotTime: '',
  slots: '',
})
const touched = reactive({
  skill: false,
  title: false,
  location: false,
  maxCapacity: false,
  durationWeeks: false,
  lessonsPerWeek: false,
  sessionDurationMinutes: false,
  slotDate: false,
  slotTime: false,
})
const stageErrors = ref([''])
const stageTouched = ref([false])

const physical = computed(() => mode.value === 'physical')

// The genre comes from the profile skill, so it is shown but cannot be edited here
const skillGenre = computed(() => {
  for (const s of store.profile.skillsTeach || []) {
    if (s.name === skill.value) return s.category
  }
  return ''
})

// Needs a name (it is shown to students) and at least one skill I can teach
const profileReady = computed(() => {
  return store.profile && store.profile.name && (store.profile.skillsTeach || []).length > 0
})

const fieldLabels = {
  skill: 'Skill',
  title: 'Title',
  location: 'Meeting place',
  maxCapacity: 'Maximum students',
  durationWeeks: 'Course length',
  lessonsPerWeek: 'Lessons per week',
  sessionDurationMinutes: 'Session duration',
}

function fieldProblem(field) {
  if (field === 'skill') return skill.value ? '' : 'Pick one of your skills.'
  if (field === 'title') {
    if (!title.value.trim()) return 'Please enter a title.'
    return findTitleProblem(title.value)
  }
  if (field === 'location') {
    return physical.value && !meetingPlace.value ? 'Search for the meeting place and pick it from the list.' : ''
  }
  if (field === 'maxCapacity') {
    return Number.isInteger(maxCapacity.value) && maxCapacity.value >= 1 && maxCapacity.value <= 50
      ? ''
      : 'Maximum students must be a whole number from 1 to 50.'
  }
  if (field === 'durationWeeks') {
    return Number.isInteger(durationWeeks.value) && durationWeeks.value >= 1 && durationWeeks.value <= 52
      ? ''
      : 'Course length must be a whole number of weeks (1-52).'
  }
  if (field === 'lessonsPerWeek') {
    return Number.isInteger(lessonsPerWeek.value) && lessonsPerWeek.value >= 1 && lessonsPerWeek.value <= 7
      ? ''
      : 'Lessons per week must be a whole number (1-7).'
  }
  if (field === 'sessionDurationMinutes') {
    return Number.isInteger(sessionDurationMinutes.value) && sessionDurationMinutes.value >= 1 && sessionDurationMinutes.value <= 1440
      ? ''
      : 'Session duration must be a whole number from 1 to 1440 minutes.'
  }
  return ''
}

function updateSummary() {
  if (!submitAttempted.value) return
  const invalidFields = Object.keys(fieldLabels).filter((field) => fieldErrors[field])
    .map((field) => fieldLabels[field])
  if (slots.value.length === 0 || fieldErrors.slotDate || fieldErrors.slotTime) {
    invalidFields.push('Start date and time')
  }
  stageErrors.value.forEach((stageError, index) => {
    if (stageError) invalidFields.push(`Stage ${index + 1} name`)
  })
  summaryError.value = invalidFields.length
    ? `Please correct these fields: ${invalidFields.join(', ')}.`
    : ''
}

function handleFieldChange(field) {
  touched[field] = true
  fieldErrors[field] = fieldProblem(field)
  error.value = ''
  updateSummary()
}

function handleModeChange() {
  if (submitAttempted.value) {
    validateForm()
  } else {
    fieldErrors.location = ''
  }
}

// a place was picked in the map search
function onPlacePicked(place) {
  meetingPlace.value = place
  handleFieldChange('location')
}

function handleStageChange(index) {
  stageTouched.value[index] = true
  stageErrors.value[index] = stages.value[index].name.trim() ? '' : 'Stage name is required.'
  updateSummary()
}

function validateForm() {
  submitAttempted.value = true
  for (const field of Object.keys(fieldLabels)) {
    touched[field] = true
    fieldErrors[field] = fieldProblem(field)
  }
  if (physical.value) {
    touched.location = true
    fieldErrors.location = fieldProblem('location')
  } else {
    fieldErrors.location = ''
  }
  if (slots.value.length === 0) {
    touched.slotDate = true
    touched.slotTime = true
    fieldErrors.slotDate = slotDate.value ? '' : 'Pick a start date.'
    fieldErrors.slotTime = slotTime.value ? '' : 'Pick a start time.'
  } else {
    fieldErrors.slotDate = ''
    fieldErrors.slotTime = ''
  }
  fieldErrors.slots = slots.value.length === 0 ? 'Add at least one start date and time.' : ''
  stageErrors.value = stages.value.map((stage) =>
    stage.name.trim() ? '' : 'Stage name is required.'
  )
  stageTouched.value = stages.value.map(() => true)
  updateSummary()
  return !summaryError.value
}

// Only used for the preview. The server works out the real price when saving.
const creditCost = computed(() =>
  calcCreditCost({ mode: mode.value, equipmentOption: equipmentOption.value })
)

// today as "2026-11-01" for the date picker's min (the server checks the real rule)
const today = new Date().toISOString().slice(0, 10)

// ---------- Loading ----------
onMounted(async () => {
  await auth.authStateReady()
  if (!auth.currentUser) {
    router.push('/login')
    return
  }
  uid = auth.currentUser.uid

  await store.fetchProfile()
  if (!store.error) await store.fetchOptions()
  if (!store.error) await store.fetchMyCourses()
  if (store.error) {
    blocked.value = true
    error.value = store.error
    loading.value = false
    return
  }

  if (props.id) {
    let found = null
    for (const offer of store.myOffers) {
      if (offer.id === props.id) found = offer
    }
    if (found === null) {
      blocked.value = true
      error.value = 'Course not found.'
    } else {
      fillForm(found)
    }
  }
  loading.value = false
})

function fillForm(offer) {
  original.value = offer
  skill.value = offer.skill
  title.value = offer.title
  description.value = offer.description || ''
  media.value = [...(offer.media || [])]
  mode.value = offer.mode
  // A course saved with the map search has an exact place. An older one only has typed text,
  // so the teacher is asked to search for it once.
  if (offer.mode === 'physical' && offer.placeVerified === true) {
    meetingPlace.value = {
      name: offer.place,
      address: offer.address,
      postal: offer.postal || '',
      lat: offer.lat,
      lng: offer.lng,
      region: offer.region,
    }
    oldPlace.value = ''
  } else {
    meetingPlace.value = null
    oldPlace.value = offer.mode === 'physical' ? offer.place || '' : ''
  }
  equipmentOption.value = offer.equipmentOption || 'not_required'
  difficulty.value = offer.difficulty || 'standard'
  maxCapacity.value = offer.maxCapacity || 1
  durationWeeks.value = offer.durationWeeks || 4
  lessonsPerWeek.value = offer.lessonsPerWeek || 1
  sessionDurationMinutes.value = offer.sessionDurationMinutes || 60
  stages.value = (offer.stages || []).map((st) => newStage(st))
  if (stages.value.length === 0) stages.value = [newStage()]
  stageErrors.value = stages.value.map(() => '')
  stageTouched.value = stages.value.map(() => false)
  slots.value = (offer.slots || []).map((s) => ({ date: s.date, time: s.time, taken: s.taken || 0 }))
}

// ---------- Stages ----------
function addStage() {
  if (stages.value.length < MAX_STAGES) {
    stages.value.push(newStage())
    stageErrors.value.push('')
    stageTouched.value.push(false)
  }
}

function removeStage(index) {
  if (stages.value.length <= 1) return
  for (const m of stages.value[index].media) {
    if (m.file) URL.revokeObjectURL(m.url)
  }
  stages.value.splice(index, 1)
  stageErrors.value.splice(index, 1)
  stageTouched.value.splice(index, 1)
  updateSummary()
}

// ---------- Start times ----------
function addSlot() {
  error.value = ''
  touched.slotDate = true
  touched.slotTime = true
  fieldErrors.slotDate = slotDate.value ? '' : 'Pick a start date.'
  fieldErrors.slotTime = slotTime.value ? '' : 'Pick a start time.'
  if (slotDate.value === '' || slotTime.value === '') {
    updateSummary()
    return
  }
  for (const s of slots.value) {
    if (s.date === slotDate.value && s.time === slotTime.value) {
      error.value = 'That start time is already in the list.'
      return
    }
  }
  if (slots.value.length >= 20) {
    error.value = 'You can add up to 20 start times.'
    return
  }
  slots.value.push({ date: slotDate.value, time: slotTime.value, taken: 0 })
  slots.value.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1))
  slotTime.value = ''
  fieldErrors.slotDate = ''
  fieldErrors.slotTime = ''
  fieldErrors.slots = ''
  updateSummary()
}

function removeSlot(index) {
  if (slots.value[index].taken > 0) return // students already booked it
  slots.value.splice(index, 1)
  fieldErrors.slots = slots.value.length === 0 ? 'Add at least one start date and time.' : ''
  updateSummary()
}

// ---------- Saving ----------
async function save() {
  error.value = ''
  if (!validateForm()) return

  saving.value = true
  const uploaded = [] // files uploaded during this save, removed again if the save fails

  try {
    // 1. the browser uploads the pictures to Firebase Storage
    const mediaOut = await uploadPending(media.value, uid, uploaded)
    const stagesOut = []
    for (const s of stages.value) {
      stagesOut.push({
        name: s.name.trim(),
        description: s.description.trim(),
        media: await uploadPending(s.media, uid, uploaded),
      })
    }

    // 2. the answers go to the server. No prices here: the server works them out.
    const slotsOut = []
    for (const s of slots.value) {
      slotsOut.push({ date: s.date, time: s.time })
    }
    const data = {
      skill: skill.value,
      title: title.value.trim(),
      description: description.value.trim(),
      media: mediaOut,
      mode: mode.value,
      // the place picked in the map search; the server checks it again and works out the region
      location: physical.value ? meetingPlace.value : null,
      equipmentOption: physical.value ? equipmentOption.value : 'not_required',
      difficulty: difficulty.value,
      maxCapacity: maxCapacity.value,
      durationWeeks: durationWeeks.value,
      lessonsPerWeek: lessonsPerWeek.value,
      sessionDurationMinutes: sessionDurationMinutes.value,
      stages: stagesOut,
      slots: slotsOut,
    }

    if (isEdit.value) {
      const result = await updateOffer(props.id, data)
      await deleteMany(result.removedPaths) // pictures I took off
    } else {
      await createOffer(data)
    }

    toast.show('Course saved.')
    router.push('/classes')
  } catch (err) {
    await deleteMany(uploaded) // the save failed: do not leave unused files in Storage
    error.value = errorText(err)
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm('Delete "' + original.value.title + '"? This cannot be undone.')) return
  error.value = ''
  try {
    const result = await deleteOffer(props.id)
    await deleteMany(result.removedPaths)
    toast.show('Course deleted.')
    router.push('/classes')
  } catch (err) {
    error.value = errorText(err)
  }
}
</script>

<template>
  <NavBar />
  <main class="container py-4" style="max-width: 760px">
    <button class="btn btn-link px-0 mb-2" @click="router.push('/classes')">
      &larr; Back to My classes
    </button>

    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <h1 class="h4 mb-0">
      {{ isEdit ? 'Edit course' : 'Add a skill I can teach' }}
      </h1>
    </div>

    <LoadingText v-if="loading" />
    <div v-else-if="blocked" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <!-- First time here: the profile needs a name and a skill to teach -->
    <div v-else-if="!profileReady" class="alert alert-warning">
      Before you can offer a course, add your name and at least one skill under
      "Skills I can teach" on your profile.
      <a href="#" @click.prevent="router.push('/profile')">Go to my profile</a>
    </div>

    <template v-else>
      <div v-if="error" class="alert alert-danger" role="alert">
        <strong>Could not save:</strong> {{ error }}
      </div>

      <form novalidate @submit.prevent="save">
        <!-- The skill comes from the profile, so the genre is already known -->
        <div class="mb-3">
          <label class="form-label" for="teach-skill">Skill <span class="required-marker" aria-hidden="true">*</span></label>
          <select
            id="teach-skill"
            v-model="skill"
            class="form-select"
            :class="{ 'is-invalid': fieldErrors.skill }"
            :aria-invalid="!!fieldErrors.skill"
            :aria-describedby="fieldErrors.skill ? 'teach-skill-error' : undefined"
            required
            @change="handleFieldChange('skill')"
            @blur="handleFieldChange('skill')"
          >
            <option disabled value="">Pick one of your skills</option>
            <option v-for="s in store.profile.skillsTeach" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
          <div v-if="fieldErrors.skill" id="teach-skill-error" class="invalid-feedback d-block">
            {{ fieldErrors.skill }}
          </div>
          <small v-if="skillGenre" class="text-muted">Genre: {{ skillGenre }}</small>
          <small v-else class="text-muted">
            Not in the list? Add it under "Skills I can teach" on your profile first.
          </small>
        </div>

        <SkillsBasicsField
          v-model:title="title"
          v-model:description="description"
          v-model:media="media"
          :title-error="fieldErrors.title"
          @title-input="handleFieldChange('title')"
          @title-blur="handleFieldChange('title')"
        />

        <hr />
        <h2 class="h6">Class details</h2>

        <div class="mb-3">
          <div class="form-check form-check-inline">
            <input id="mode-physical" v-model="mode" type="radio" value="physical" class="form-check-input" @change="handleModeChange" />
            <label class="form-check-label" for="mode-physical">Physical class</label>
          </div>
          <div class="form-check form-check-inline">
            <input id="mode-online" v-model="mode" type="radio" value="online" class="form-check-input" @change="handleModeChange" />
            <label class="form-check-label" for="mode-online">Online class</label>
          </div>
        </div>

        <template v-if="physical">
          <!-- The place comes from a map search (OneMap), so it is real and its pin is exact.
               The region is worked out from it by the server. -->
          <div class="mb-3">
            <PlacePicker
              :model-value="meetingPlace"
              input-id="class-place"
              :error="fieldErrors.location"
              :old-place="oldPlace"
              @update:model-value="onPlacePicked"
              @leave="handleFieldChange('location')"
            />
          </div>

          <div class="mb-3">
            <div class="fw-semibold mb-1">Equipment</div>
            <div class="form-check">
              <input id="equip-provided" v-model="equipmentOption" type="radio" value="provided" class="form-check-input" />
              <label class="form-check-label" for="equip-provided">Provided by the teacher (students pay +1 credit)</label>
            </div>
            <div class="form-check">
              <input id="equip-bring" v-model="equipmentOption" type="radio" value="bring" class="form-check-input" />
              <label class="form-check-label" for="equip-bring">Students bring their own</label>
            </div>
            <div class="form-check">
              <input id="equip-not-required" v-model="equipmentOption" type="radio" value="not_required" class="form-check-input" />
              <label class="form-check-label" for="equip-not-required">Equipment is not required</label>
            </div>
          </div>
        </template>

        <div class="mb-3">
          <div class="fw-semibold mb-1">Difficulty</div>
          <div class="form-check">
            <input id="diff-standard" v-model="difficulty" type="radio" value="standard" class="form-check-input" />
            <label class="form-check-label" for="diff-standard">Standard</label>
          </div>
          <div class="form-check">
            <input id="diff-risk" v-model="difficulty" type="radio" value="high_risk" class="form-check-input" />
            <label class="form-check-label" for="diff-risk">High difficulty</label>
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label" for="max-capacity">Maximum students per class <span class="required-marker" aria-hidden="true">*</span></label>
          <input
            id="max-capacity"
            v-model.number="maxCapacity"
            type="number"
            min="1"
            max="50"
            class="form-control"
            :class="{ 'is-invalid': fieldErrors.maxCapacity }"
            :aria-invalid="!!fieldErrors.maxCapacity"
            :aria-describedby="fieldErrors.maxCapacity ? 'max-capacity-error' : undefined"
            required
            @input="handleFieldChange('maxCapacity')"
            @blur="handleFieldChange('maxCapacity')"
          />
          <div v-if="fieldErrors.maxCapacity" id="max-capacity-error" class="invalid-feedback d-block">
            {{ fieldErrors.maxCapacity }}
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-12 col-sm-4">
            <label class="form-label" for="weeks">Course length (weeks) <span class="required-marker" aria-hidden="true">*</span></label>
            <input id="weeks" v-model.number="durationWeeks" type="number" min="1" max="52" class="form-control" :class="{ 'is-invalid': fieldErrors.durationWeeks }" :aria-invalid="!!fieldErrors.durationWeeks" :aria-describedby="fieldErrors.durationWeeks ? 'weeks-error' : undefined" required @input="handleFieldChange('durationWeeks')" @blur="handleFieldChange('durationWeeks')" />
            <div v-if="fieldErrors.durationWeeks" id="weeks-error" class="invalid-feedback d-block">{{ fieldErrors.durationWeeks }}</div>
          </div>
          <div class="col-12 col-sm-4">
            <label class="form-label" for="lessons">Lessons per week <span class="required-marker" aria-hidden="true">*</span></label>
            <input id="lessons" v-model.number="lessonsPerWeek" type="number" min="1" max="7" class="form-control" :class="{ 'is-invalid': fieldErrors.lessonsPerWeek }" :aria-invalid="!!fieldErrors.lessonsPerWeek" :aria-describedby="fieldErrors.lessonsPerWeek ? 'lessons-error' : undefined" required @input="handleFieldChange('lessonsPerWeek')" @blur="handleFieldChange('lessonsPerWeek')" />
            <div v-if="fieldErrors.lessonsPerWeek" id="lessons-error" class="invalid-feedback d-block">{{ fieldErrors.lessonsPerWeek }}</div>
          </div>
          <div class="col-12 col-sm-4">
            <label class="form-label" for="session-duration">Session duration (minutes) <span class="required-marker" aria-hidden="true">*</span></label>
            <input
              id="session-duration"
              v-model.number="sessionDurationMinutes"
              type="number"
              min="1"
              max="1440"
              class="form-control"
              :class="{ 'is-invalid': fieldErrors.sessionDurationMinutes }"
              :aria-invalid="!!fieldErrors.sessionDurationMinutes"
              :aria-describedby="fieldErrors.sessionDurationMinutes ? 'session-duration-error' : undefined"
              required
              @input="handleFieldChange('sessionDurationMinutes')"
              @blur="handleFieldChange('sessionDurationMinutes')"
            />
            <div v-if="fieldErrors.sessionDurationMinutes" id="session-duration-error" class="invalid-feedback d-block">
              {{ fieldErrors.sessionDurationMinutes }}
            </div>
          </div>
        </div>

        <hr />
        <h2 class="h6">Start dates and times <span class="required-marker" aria-hidden="true">*</span></h2>
        <p class="text-muted small">
          Students book one of these. Add at least one (Singapore time).
        </p>

        <ul class="list-group mb-2">
          <li
            v-for="(s, i) in slots"
            :key="s.date + s.time"
            class="list-group-item d-flex justify-content-between align-items-center"
          >
            <span>
              {{ s.date }} &middot; {{ s.time }}
              <small v-if="s.taken > 0" class="text-muted ms-2">{{ s.taken }} booked</small>
            </span>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              :disabled="s.taken > 0"
              :title="s.taken > 0 ? 'Students have booked this start time' : ''"
              @click="removeSlot(i)"
            >
              Remove
            </button>
          </li>
          <li v-if="slots.length === 0" class="list-group-item text-muted">No start times yet</li>
        </ul>

        <div class="row g-2 mb-4">
          <div class="col-12 col-sm-4">
            <label class="form-label" for="slot-date">Start date <span v-if="slots.length === 0" class="required-marker" aria-hidden="true">*</span></label>
            <input
              id="slot-date"
              v-model="slotDate"
              type="date"
              class="form-control"
              :class="{ 'is-invalid': fieldErrors.slotDate }"
              :aria-invalid="!!fieldErrors.slotDate"
              :aria-describedby="fieldErrors.slotDate ? 'slot-date-error' : undefined"
              :min="today"
              :required="slots.length === 0"
              @input="handleFieldChange('slotDate')"
              @blur="handleFieldChange('slotDate')"
            />
            <div v-if="fieldErrors.slotDate" id="slot-date-error" class="invalid-feedback d-block">
              {{ fieldErrors.slotDate }}
            </div>
          </div>
          <div class="col-12 col-sm-4">
            <label class="form-label" for="slot-time">Start time <span v-if="slots.length === 0" class="required-marker" aria-hidden="true">*</span></label>
            <input
              id="slot-time"
              v-model="slotTime"
              type="time"
              class="form-control"
              :class="{ 'is-invalid': fieldErrors.slotTime }"
              :aria-invalid="!!fieldErrors.slotTime"
              :aria-describedby="fieldErrors.slotTime ? 'slot-time-error' : undefined"
              :required="slots.length === 0"
              @input="handleFieldChange('slotTime')"
              @blur="handleFieldChange('slotTime')"
            />
            <div v-if="fieldErrors.slotTime" id="slot-time-error" class="invalid-feedback d-block">
              {{ fieldErrors.slotTime }}
            </div>
          </div>
          <div class="col-12 col-sm-4 d-flex align-items-end">
            <button type="button" class="btn btn-outline-secondary" @click="addSlot">Add start time</button>
          </div>
        </div>
        <div v-if="submitAttempted && fieldErrors.slots" class="text-danger small mb-3" role="alert">
          {{ fieldErrors.slots }}
        </div>

        <hr />
        <h2 class="h6">Stages <span class="required-marker" aria-hidden="true">*</span></h2>
        <p class="text-muted small">
          Add at least 1 stage. A course can have up to {{ MAX_STAGES }} stages.
        </p>

        <div v-for="(s, i) in stages" :key="s.key" class="card card-body mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <strong>Stage {{ i + 1 }}</strong>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              :disabled="stages.length === 1"
              @click="removeStage(i)"
            >
              Delete stage
            </button>
          </div>
          <label class="form-label" :for="'stage-name-' + i">Stage name <span class="required-marker" aria-hidden="true">*</span></label>
          <input
            :id="'stage-name-' + i"
            v-model="s.name"
            class="form-control mb-2"
            :class="{ 'is-invalid': stageTouched[i] && stageErrors[i] }"
            :aria-invalid="stageTouched[i] && !!stageErrors[i]"
            :aria-describedby="stageTouched[i] && stageErrors[i] ? 'stage-name-error-' + i : undefined"
            maxlength="60"
            placeholder="Stage name"
            required
            @input="handleStageChange(i)"
            @blur="handleStageChange(i)"
          />
          <div v-if="stageTouched[i] && stageErrors[i]" :id="'stage-name-error-' + i" class="invalid-feedback d-block mb-2">
            {{ stageErrors[i] }}
          </div>
          <textarea v-model="s.description" class="form-control mb-2" rows="2" maxlength="500" placeholder="Short description" />
          <MediaPicker v-if="picturesEnabled" v-model="s.media" :max="3" :allow-video="false" label="Stage pictures (optional)" />
        </div>

        <button
          type="button"
          class="btn btn-outline-secondary mb-4"
          :disabled="stages.length >= MAX_STAGES"
          @click="addStage"
        >
          + Add stage
        </button>

        <div class="alert alert-light border mb-3">
          <p class="mb-1">
            Students pay <strong>{{ creditCost }} credit{{ creditCost === 1 ? '' : 's' }}</strong> when they book.
            The credit is held until the course is finished.
          </p>
          <p class="mb-0">
            You earn <strong>{{ creditCost }} credit{{ creditCost === 1 ? '' : 's' }}</strong>
            for each student, once you and the student both confirm the course is finished.
          </p>
        </div>

        <div v-if="summaryError" class="alert alert-danger" role="alert" aria-live="assertive">
          {{ summaryError }}
        </div>

        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-brand" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save course' }}
          </button>
          <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="router.push('/classes')">
            Cancel
          </button>
          <button
            v-if="isEdit"
            type="button"
            class="btn btn-outline-danger ms-auto"
            :disabled="saving"
            @click="remove"
          >
            Delete course
          </button>
        </div>
        <p v-if="isEdit" class="text-muted small mt-2">
          A course that students have booked cannot be deleted.
        </p>
      </form>
    </template>
  </main>
</template>

<style scoped>
.required-marker {
  color: #dc3545;
  font-weight: 700;
}

.slot-input {
  flex: 1 1 9rem;
  min-width: 0;
}
</style>
