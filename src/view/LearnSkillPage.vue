<script setup>
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '@/firebase'
import { useProfileStore } from '@/stores/profile'
import { createGoal, updateGoal, deleteGoal, errorText } from '@/services/api'
import { uploadPending, deleteMany } from '@/services/storage'
import SkillsBasicsField from '@/components/SkillsBasicsField.vue'
import { findTitleProblem } from '@/services/skillRules'
import NavBar from '@/components/NavBar.vue'
import LoadingText from '@/components/LoadingText.vue'
import { useToastStore } from '@/stores/toast'

// /learn/:id gives the id of the goal being edited (none = a new one)
const props = defineProps({ id: { type: String, default: null } })
const router = useRouter()
const store = useProfileStore()
const toast = useToastStore()
const isEdit = computed(() => !!props.id)

let uid = null

const skill = ref('') // one of the names in the profile's "skills I want to learn"
const title = ref('')
const description = ref('')
const media = ref([])
const original = ref(null)

const loading = ref(true)
const blocked = ref(false)
const saving = ref(false)
const error = ref('')
const summaryError = ref('')
const fieldErrors = reactive({ skill: '', title: '' })
const touched = reactive({ skill: false, title: false })
const submitAttempted = ref(false)

const skillGenre = computed(() => {
  for (const s of store.profile.skillsLearn || []) {
    if (s.name === skill.value) return s.category
  }
  return ''
})

const profileReady = computed(() => {
  return store.profile && (store.profile.skillsLearn || []).length > 0
})

function validateSkill() {
  return skill.value ? '' : 'Pick one of the skills you want to learn.'
}

function validateTitle() {
  if (!title.value.trim()) return 'Please enter a title.'
  return findTitleProblem(title.value)
}

function validateForm() {
  submitAttempted.value = true
  touched.skill = true
  touched.title = true
  fieldErrors.skill = validateSkill()
  fieldErrors.title = validateTitle()
  const invalidFields = []
  if (fieldErrors.skill) invalidFields.push('Skill')
  if (fieldErrors.title) invalidFields.push('Title')
  summaryError.value = invalidFields.length
    ? `Please correct these fields: ${invalidFields.join(' and ')}.`
    : ''
  return invalidFields.length === 0
}

function handleFieldChange(field) {
  touched[field] = true
  fieldErrors[field] = field === 'skill' ? validateSkill() : validateTitle()
  if (submitAttempted.value) validateForm()
  else summaryError.value = ''
}

onMounted(async () => {
  await auth.authStateReady()
  if (!auth.currentUser) {
    router.push('/login')
    return
  }
  uid = auth.currentUser.uid

  await store.fetchProfile()
  if (!store.error) await store.fetchMyCourses()
  if (store.error) {
    blocked.value = true
    error.value = store.error
    loading.value = false
    return
  }

  if (props.id) {
    let found = null
    for (const goal of store.myGoals) {
      if (goal.id === props.id) found = goal
    }
    if (found === null) {
      blocked.value = true
      error.value = 'Learning goal not found.'
    } else {
      original.value = found
      skill.value = found.skill
      title.value = found.title
      description.value = found.description || ''
      media.value = [...(found.media || [])]
    }
  }
  loading.value = false
})

async function save() {
  error.value = ''
  if (!validateForm()) return

  saving.value = true
  const uploaded = []

  try {
    const mediaOut = await uploadPending(media.value, uid, uploaded)
    const data = {
      skill: skill.value,
      title: title.value.trim(),
      description: description.value.trim(),
      media: mediaOut,
    }

    if (isEdit.value) {
      const result = await updateGoal(props.id, data)
      await deleteMany(result.removedPaths)
    } else {
      await createGoal(data)
    }
    toast.show('Learning goal saved.')
    router.push('/profile')
  } catch (err) {
    await deleteMany(uploaded)
    error.value = errorText(err)
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm('Remove "' + original.value.title + '" from your learning list?')) return
  error.value = ''
  try {
    const result = await deleteGoal(props.id)
    await deleteMany(result.removedPaths)
    toast.show('Removed from your learning list.')
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
    <h1 class="h4 mb-3">
      {{ isEdit ? 'Edit skill I want to learn' : 'Add a skill I want to learn' }}
    </h1>

    <LoadingText v-if="loading" />
    <div v-else-if="blocked" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-else-if="!profileReady" class="alert alert-warning">
      Add at least one skill under "Skills I want to learn" on your profile first.
      <a href="#" @click.prevent="router.push('/profile')">Go to my profile</a>
    </div>

    <form v-else novalidate @submit.prevent="save">
      <div v-if="error" class="alert alert-danger" role="alert">
        <strong>Could not save:</strong> {{ error }}
      </div>

      <div class="mb-3">
        <label class="form-label" for="learn-skill">Skill <span class="required-marker" aria-hidden="true">*</span></label>
        <select
          id="learn-skill"
          v-model="skill"
          class="form-select"
          :class="{ 'is-invalid': fieldErrors.skill }"
          :aria-invalid="!!fieldErrors.skill"
          :aria-describedby="fieldErrors.skill ? 'learn-skill-error' : undefined"
          required
          @change="handleFieldChange('skill')"
          @blur="handleFieldChange('skill')"
        >
          <option disabled value="">Pick one of your skills</option>
          <option v-for="s in store.profile.skillsLearn" :key="s.name" :value="s.name">{{ s.name }}</option>
        </select>
        <div v-if="fieldErrors.skill" id="learn-skill-error" class="invalid-feedback d-block">
          {{ fieldErrors.skill }}
        </div>
        <small v-if="skillGenre" class="text-muted">Genre: {{ skillGenre }}</small>
      </div>

      <SkillsBasicsField
        v-model:title="title"
        v-model:description="description"
        v-model:media="media"
        :title-error="fieldErrors.title"
        @title-input="handleFieldChange('title')"
        @title-blur="handleFieldChange('title')"
      />

      <div v-if="summaryError" class="alert alert-danger" role="alert" aria-live="assertive">
        {{ summaryError }}
      </div>

      <div class="d-flex gap-2">
        <button class="btn btn-brand" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save goal' }}
        </button>
        <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="router.push('/profile')">
          Cancel
        </button>
        <button v-if="isEdit" type="button" class="btn btn-outline-danger ms-auto" :disabled="saving" @click="remove">
          Delete
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.required-marker {
  color: #dc3545;
  font-weight: 700;
}
</style>
