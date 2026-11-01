<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '@/firebase'
import { useProfileStore } from '@/stores/profile'
import { createOffer, updateOffer, deleteOffer, errorText } from '@/services/api'
import { calcCreditCost, MAX_STAGES } from '@/services/credits'
import { uploadPending, deleteMany } from '@/services/storage'
import SkillsBasicsField from '@/components/SkillsBasicsField.vue'
import MediaPicker from '@/components/MediaPicker.vue'
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
const region = ref('')
const place = ref('')
const equipmentOption = ref('not_required')
const difficulty = ref('standard')
const maxCapacity = ref(5)
const durationWeeks = ref(4)
const lessonsPerWeek = ref(1)
const stages = ref([newStage()])
const slots = ref([]) // [{ date, time, taken }]  taken = students already booked (edit only)

// the little "add a start time" row
const slotDate = ref('')
const slotTime = ref('')

const showPast = ref(false)
const original = ref(null) // the saved course when editing

const loading = ref(true)
const blocked = ref(false)
const saving = ref(false)
const error = ref('')

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
  if (!store.error) await store.fetchSkillCards()
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
  region.value = offer.region || ''
  place.value = offer.place || ''
  equipmentOption.value = offer.equipmentOption || 'not_required'
  difficulty.value = offer.difficulty || 'standard'
  maxCapacity.value = offer.maxCapacity || 1
  durationWeeks.value = offer.durationWeeks || 4
  lessonsPerWeek.value = offer.lessonsPerWeek || 1
  stages.value = (offer.stages || []).map((st) => newStage(st))
  if (stages.value.length === 0) stages.value = [newStage()]
  slots.value = (offer.slots || []).map((s) => ({ date: s.date, time: s.time, taken: s.taken || 0 }))
}

// ---------- Past skills (skill cards I earned) ----------
// Picking one fills in a starting point: the title, the matching skill, and its
// sub-skills as stages. Everything can still be changed.
function pickPastSkill(card) {
  title.value = card.name
  for (const s of store.profile.skillsTeach || []) {
    if (s.name.toLowerCase() === card.name.toLowerCase()) skill.value = s.name
  }
  if (card.subskills && card.subskills.length > 0) {
    stages.value = []
    for (const sub of card.subskills.slice(0, MAX_STAGES)) {
      stages.value.push(newStage({ name: sub }))
    }
  }
  showPast.value = false
}

// ---------- Stages ----------
function addStage() {
  if (stages.value.length < MAX_STAGES) stages.value.push(newStage())
}

function removeStage(index) {
  if (stages.value.length <= 1) return
  for (const m of stages.value[index].media) {
    if (m.file) URL.revokeObjectURL(m.url)
  }
  stages.value.splice(index, 1)
}

// ---------- Start times ----------
function addSlot() {
  error.value = ''
  if (slotDate.value === '' || slotTime.value === '') {
    error.value = 'Pick a date and a time first.'
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
}

function removeSlot(index) {
  if (slots.value[index].taken > 0) return // students already booked it
  slots.value.splice(index, 1)
}

// ---------- Saving ----------
// quick checks for instant feedback; the server checks everything again
function validate() {
  if (skill.value === '') return 'Pick one of your skills.'
  if (!title.value.trim()) return 'Please enter a title.'
  const titleProblem = findTitleProblem(title.value)
  if (titleProblem !== '') return titleProblem
  if (physical.value) {
    if (region.value === '') return 'Please pick a region.'
    if (!place.value.trim()) return 'Please enter a public meeting place.'
  }
  if (!Number.isInteger(maxCapacity.value) || maxCapacity.value < 1 || maxCapacity.value > 50) {
    return 'Maximum students must be a whole number from 1 to 50.'
  }
  if (!Number.isInteger(durationWeeks.value) || durationWeeks.value < 1 || durationWeeks.value > 52) {
    return 'Course length must be a whole number of weeks (1-52).'
  }
  if (!Number.isInteger(lessonsPerWeek.value) || lessonsPerWeek.value < 1 || lessonsPerWeek.value > 7) {
    return 'Lessons per week must be a whole number (1-7).'
  }
  for (const s of stages.value) {
    if (!s.name.trim()) return 'Every stage needs a name.'
  }
  if (slots.value.length === 0) return 'Add at least one start date and time.'
  return ''
}

async function save() {
  error.value = validate()
  if (error.value) return

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
      region: physical.value ? region.value : '',
      place: physical.value ? place.value.trim() : '',
      equipmentOption: physical.value ? equipmentOption.value : 'not_required',
      difficulty: physical.value ? difficulty.value : 'standard',
      maxCapacity: maxCapacity.value,
      durationWeeks: durationWeeks.value,
      lessonsPerWeek: lessonsPerWeek.value,
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
    router.push('/profile')
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
    router.push('/profile')
  } catch (err) {
    error.value = errorText(err)
  }
}
</script>

<template>
  <NavBar />
  <main class="container py-4" style="max-width: 760px">
    <button class="btn btn-link px-0 mb-2" @click="router.push('/profile')">
      &larr; Back to profile
    </button>

    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <h1 class="h4 mb-0">
        {{ isEdit ? 'Edit course' : 'Add a skill I can teach' }}
      </h1>
      <button
        v-if="!isEdit && !loading && !blocked && profileReady"
        type="button"
        class="btn btn-outline-secondary btn-sm"
        @click="showPast = !showPast"
      >
        {{ showPast ? 'Hide past skills' : 'View past skills' }}
      </button>
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
      <div v-if="showPast" class="mb-4">
        <p v-if="!store.skillCards.length" class="text-muted">
          You haven't completed any courses yet.
        </p>
        <div v-else class="row g-2">
          <div v-for="card in store.skillCards" :key="card.id" class="col-12 col-sm-6">
            <button
              type="button"
              class="btn btn-light border w-100 text-start"
              @click="pickPastSkill(card)"
            >
              <strong>{{ card.name }}</strong>
              <small class="text-muted d-block">{{ card.category }}</small>
            </button>
          </div>
        </div>
      </div>

      <div v-if="error" class="alert alert-danger" role="alert">
        <strong>Could not save:</strong> {{ error }}
      </div>

      <form @submit.prevent="save">
        <!-- The skill comes from the profile, so the genre is already known -->
        <div class="mb-3">
          <label class="form-label" for="teach-skill">Skill <span class="text-danger">*</span></label>
          <select id="teach-skill" v-model="skill" class="form-select" required>
            <option disabled value="">Pick one of your skills</option>
            <option v-for="s in store.profile.skillsTeach" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
          <small v-if="skillGenre" class="text-muted">Genre: {{ skillGenre }}</small>
          <small v-else class="text-muted">
            Not in the list? Add it under "Skills I can teach" on your profile first.
          </small>
        </div>

        <SkillsBasicsField
          v-model:title="title"
          v-model:description="description"
          v-model:media="media"
        />

        <hr />
        <h2 class="h6">Class details</h2>

        <div class="mb-3">
          <div class="form-check form-check-inline">
            <input id="mode-physical" v-model="mode" type="radio" value="physical" class="form-check-input" />
            <label class="form-check-label" for="mode-physical">Physical class</label>
          </div>
          <div class="form-check form-check-inline">
            <input id="mode-online" v-model="mode" type="radio" value="online" class="form-check-input" />
            <label class="form-check-label" for="mode-online">Online class</label>
          </div>
        </div>

        <template v-if="physical">
          <!-- region + a public place, never a home address -->
          <div class="row g-3 mb-3">
            <div class="col-12 col-sm-4">
              <label class="form-label" for="class-region">Region</label>
              <select id="class-region" v-model="region" class="form-select" required>
                <option disabled value="">Pick a region</option>
                <option v-for="r in store.regions" :key="r" :value="r">{{ r }}</option>
              </select>
            </div>
            <div class="col-12 col-sm-8">
              <label class="form-label" for="class-place">Public meeting place</label>
              <input
                id="class-place"
                v-model="place"
                type="text"
                class="form-control"
                maxlength="100"
                placeholder="e.g. Bishan Library"
                required
              />
            </div>
          </div>
          <p class="text-muted small mt-n2">
            Use a public place, not your home. Students see the region and place name, and the map pin is only approximate.
          </p>

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
        </template>

        <div class="mb-3">
          <label class="form-label" for="max-capacity">Maximum students per class</label>
          <input
            id="max-capacity"
            v-model.number="maxCapacity"
            type="number"
            min="1"
            max="50"
            class="form-control"
            required
          />
        </div>

        <div class="row g-3 mb-3">
          <div class="col-6">
            <label class="form-label" for="weeks">Course length (weeks)</label>
            <input id="weeks" v-model.number="durationWeeks" type="number" min="1" max="52" class="form-control" required />
          </div>
          <div class="col-6">
            <label class="form-label" for="lessons">Lessons per week</label>
            <input id="lessons" v-model.number="lessonsPerWeek" type="number" min="1" max="7" class="form-control" required />
          </div>
        </div>

        <hr />
        <h2 class="h6">Start dates and times</h2>
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

        <div class="d-flex flex-wrap gap-2 mb-4">
          <input v-model="slotDate" type="date" class="form-control slot-input" :min="today" aria-label="Start date" />
          <input v-model="slotTime" type="time" class="form-control slot-input" aria-label="Start time" />
          <button type="button" class="btn btn-outline-secondary" @click="addSlot">Add start time</button>
        </div>

        <hr />
        <h2 class="h6">Stages</h2>
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
          <input v-model="s.name" class="form-control mb-2" maxlength="60" placeholder="Stage name" required />
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

        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-brand" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save course' }}
          </button>
          <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="router.push('/profile')">
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
.slot-input {
  flex: 1 1 9rem;
  min-width: 0;
}
</style>
