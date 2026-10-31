 <script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { waitForUser } from '@/services/currentUser'
import {
  ensureUserProfile, saveUserSkill, deleteUserSkill, getPastSkillCards,
  calcCreditCost, calcCompletionCredits,
  MAX_STAGES, BONUS_MIN_STAGES, BONUS_STAGE_INTERVAL,
} from '@/services/skills'
import { uploadPending, deleteMany, collectPaths } from '@/services/storage'
import SkillsBasicsField from '@/component/SkillsBasicsField.vue'
import MediaPicker from '@/component/MediaPicker.vue'

const props = defineProps({ id: { type: String, default: null } })
const router = useRouter()
const isEdit = computed(() => !!props.id)

let uid = null
let profile = null
let original = null
let keyCounter = 0

const newStage = (s = {}) => ({
  key: ++keyCounter,
  name: s.name || '',
  description: s.description || '',
  media: s.media ? [...s.media] : [],
})

const title = ref('')
const description = ref('')
const media = ref([])
const mode = ref('physical')
const classLocation = ref('')
const equipmentOption = ref('not_required')
const difficulty = ref('standard')
const maxCapacity = ref(1)
const durationWeeks = ref(4)
const lessonsPerWeek = ref(1)
const stages = ref([newStage()])

const pastCards = ref([])
const showPast = ref(false)

const loading = ref(true)
const blocked = ref(false)
const saving = ref(false)
const error = ref('')

const physical = computed(() => mode.value === 'physical')

const creditCost = computed(() =>
  calcCreditCost({
    mode: mode.value,
    equipmentOption: equipmentOption.value,
  })
)

const completionCredits = computed(() =>
  calcCompletionCredits({
    stageCount: stages.value.length,
    lessonsPerWeek: lessonsPerWeek.value,
    equipmentOption: physical.value ? equipmentOption.value : 'not_required',
    difficulty: physical.value ? difficulty.value : 'standard',
  })
)

onMounted(async () => {
  const user = await waitForUser()
  if (!user) return router.push('/login')
  uid = user.uid

  try {
    profile = await ensureUserProfile(user)

    if (props.id) {
      const s = (profile.skillsTeach || []).find(
        (skill) => skill.title.toLowerCase() === props.id.toLowerCase()
      )
      if (!s) {
        blocked.value = true
        error.value = 'Skill not found.'
        return
      }
      original = s
      title.value = s.title
      description.value = s.description || ''
      media.value = [...(s.media || [])]
      mode.value = s.mode
      classLocation.value = s.classLocation || ''
      equipmentOption.value = s.equipmentOption || (s.equipmentProvided ? 'provided' : 'bring')
      difficulty.value = s.difficulty || 'standard'
      maxCapacity.value = s.maxCapacity || 1
      durationWeeks.value = s.durationWeeks || 4
      lessonsPerWeek.value = s.lessonsPerWeek || 1
      stages.value = (s.stages || []).map((st) => newStage(st))
      if (!stages.value.length) stages.value = [newStage()]
    }
  } catch (e) {
    blocked.value = true
    error.value = 'Could not load this page. Please try again.'
    console.error(e)
  } finally {
    loading.value = false
  }

  if (!props.id) {
    try {
      pastCards.value = await getPastSkillCards(uid)
    } catch (e) {
      console.error('Could not load past skills:', e)
    }
  }
})

function pickPastSkill(card) {
  console.log('done!!!')
}

function addStage() {
  if (stages.value.length < MAX_STAGES) stages.value.push(newStage())
}

function removeStage(index) {
  if (stages.value.length <= 1) return
  stages.value[index].media.forEach((m) => m.file && URL.revokeObjectURL(m.url))
  stages.value.splice(index, 1)
}

function validate() {
  if (!title.value.trim()) return 'Please enter a title.'
  if (!Number.isInteger(maxCapacity.value) || maxCapacity.value < 1) {
    return 'Maximum class capacity must be a whole number greater than 0.'
  }
  const weeks = durationWeeks.value
  const lessons = lessonsPerWeek.value
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
    return 'Course length must be a whole number of weeks (1–52).'
  }
  if (!Number.isInteger(lessons) || lessons < 1 || lessons > 7) {
    return 'Lessons per week must be a whole number (1–7).'
  }
  if (stages.value.length < 1) return 'A course needs at least 1 stage.'
  if (stages.value.some((s) => !s.name.trim())) return 'Every stage needs a name.'
  return ''
}

async function save() {
  error.value = validate()
  if (error.value) return

  saving.value = true
  const uploaded = []

  try {
    const mediaOut = await uploadPending(media.value, uid, uploaded)

    const stagesOut = []
    for (const s of stages.value) {
      stagesOut.push({
        name: s.name.trim(),
        description: s.description.trim(),
        media: await uploadPending(s.media, uid, uploaded),
      })
    }

    const data = {
      title: title.value.trim(),
      description: description.value.trim(),
      media: mediaOut,
      mode: mode.value,
      classLocation: physical.value ? classLocation.value.trim() : '',
      equipmentOption: physical.value ? equipmentOption.value : 'not_required',
      equipmentProvided: physical.value && equipmentOption.value === 'provided',
      difficulty: physical.value ? difficulty.value : 'standard',
      maxCapacity: maxCapacity.value,
      durationWeeks: durationWeeks.value,
      lessonsPerWeek: lessonsPerWeek.value,
      stages: stagesOut,
      creditCost: creditCost.value,
      bonusCredit: completionCredits.value > 1,
      studentCompletionCredits: completionCredits.value,
      teacherCredits: creditCost.value,
    }

    await saveUserSkill({
      uid,
      kind: 'teach',
      skill: data,
      originalTitle: original?.title,
    })

    // Saved: remove files the user took off (including whole deleted stages)
    if (original) {
      const keep = new Set(collectPaths(mediaOut, stagesOut))
      await deleteMany(
        collectPaths(original.media, original.stages).filter((p) => !keep.has(p))
      )
    }

    router.push('/profile')
  } catch (e) {
    await deleteMany(uploaded) // save failed: don't leave orphaned uploads
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm(`Delete "${original.title}"? This can't be undone.`)) return
  error.value = ''
  try {
    const removed = await deleteUserSkill({ uid, kind: 'teach', title: original.title })
    await deleteMany(collectPaths(removed.media, removed.stages))
    router.push('/profile')
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <main class="container py-4" style="max-width: 760px">
    <button class="btn btn-link px-0 mb-2" @click="router.push('/profile')">
      ← Back to profile
    </button>

    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <h1 class="h4 mb-0">
        {{ isEdit ? 'Edit teaching skill' : 'Add a skill I can teach' }}
      </h1>
      <button
        v-if="!isEdit && !loading && !blocked"
        type="button"
        class="btn btn-outline-secondary btn-sm"
        @click="showPast = !showPast"
      >
        {{ showPast ? 'Hide past skills' : 'View past skills' }}
      </button>
    </div>

    <p v-if="loading" role="status">Loading...</p>
      <div v-else-if="blocked" class="alert alert-danger" role="alert">
        {{ error }}
      </div>

    <template v-else>
      <div v-if="showPast" class="mb-4">
        <p v-if="!pastCards.length" class="text-muted">
          You haven't completed any courses yet.
        </p>
        <div v-else class="row g-2">
          <div v-for="card in pastCards" :key="card.id" class="col-12 col-sm-6">
            <button
              type="button"
              class="btn btn-light border w-100 text-start"
              @click="pickPastSkill(card)"
            >
              <strong>{{ card.title }}</strong>
              <small class="text-muted d-block">{{ card.description }}</small>
            </button>
          </div>
        </div>
      </div>

      <div v-if="error" class="alert alert-danger" role="alert">
        <strong>Could not save:</strong> {{ error }}
      </div>

      <form @submit.prevent="save">
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
          <div class="mb-3">
            <label class="form-label" for="class-location">Class location</label>
            <input
              id="class-location"
              v-model="classLocation"
              type="text"
              class="form-control"
              maxlength="200"
              placeholder="Insert Location Here"
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
              <label class="form-check-label" for="equip-bring">Students bring their own (earn +1 credit on completion)</label>
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
            <label class="form-check-label" for="diff-risk">
              High difficulty (students earn +1 credit when they complete the course)
            </label>
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label" for="max-capacity">Maximum students per class</label>
          <input
            id="max-capacity"
            v-model.number="maxCapacity"
            type="number"
            min="1"
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
        <h2 class="h6">Stages</h2>
        <p class="text-muted small">
          Add at least 1 stage. Students earn +1 credit from {{ BONUS_MIN_STAGES }} stages,
          plus 1 credit for every additional {{ BONUS_STAGE_INTERVAL }} stages.
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
          <MediaPicker v-model="s.media" :max="3" :allow-video="false" label="Stage pictures (optional)" />
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
            Students are charged <strong>{{ creditCost }} credit{{ creditCost === 1 ? '' : 's' }}</strong>.
          </p>
          <p class="mb-1">
            Students earn <strong>{{ completionCredits }} credit{{ completionCredits === 1 ? '' : 's' }}</strong>
            when they complete the course.
          </p>
          <p class="mb-0">
            You earn <strong>{{ creditCost }} credit{{ creditCost === 1 ? '' : 's' }}</strong>
            for teaching this course.
          </p>
        </div>

        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-brand" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save skill' }}
          </button>
          <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="router.push('/profile')">
            Cancel
          </button>
          <button
            v-if="isEdit"
            type="button"
            class="btn btn-outline-danger ms-auto"
            :disabled="saving || original?.activeStudents > 0"
            :title="original?.activeStudents > 0 ? 'Active students are participating' : ''"
            @click="remove"
          >
            Delete skill
          </button>
        </div>
        <p v-if="isEdit && original?.activeStudents > 0" class="text-muted small mt-2">
          {{ original.activeStudents }} active student(s), so this skill can't be deleted yet.
          You can still edit it, but price changes won't affect students already enrolled.
        </p>
      </form>
    </template>
  </main>
</template>

<style scoped>
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