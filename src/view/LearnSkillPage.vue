<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '@/firebase'
import { useProfileStore } from '@/stores/profile'
import { createGoal, updateGoal, deleteGoal, errorText } from '@/services/api'
import { uploadPending, deleteMany } from '@/services/storage'
import SkillsBasicsField from '@/components/SkillsBasicsField.vue'
import { findTitleProblem } from '@/services/skillRules'

// /learn/:id gives the id of the goal being edited (none = a new one)
const props = defineProps({ id: { type: String, default: null } })
const router = useRouter()
const store = useProfileStore()
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

const skillGenre = computed(() => {
  for (const s of store.profile.skillsLearn || []) {
    if (s.name === skill.value) return s.category
  }
  return ''
})

const profileReady = computed(() => {
  return store.profile && (store.profile.skillsLearn || []).length > 0
})

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
  if (skill.value === '') {
    error.value = 'Pick one of the skills you want to learn.'
    return
  }
  if (!title.value.trim()) {
    error.value = 'Please enter a title.'
    return
  }
  const titleProblem = findTitleProblem(title.value)
  if (titleProblem !== '') {
    error.value = titleProblem
    return
  }

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
    router.push('/profile')
  } catch (err) {
    error.value = errorText(err)
  }
}
</script>

<template>
  <main class="container py-4" style="max-width: 760px">
    <button class="btn btn-link px-0 mb-2" @click="router.push('/profile')">
      &larr; Back to profile
    </button>
    <h1 class="h4 mb-3">
      {{ isEdit ? 'Edit skill I want to learn' : 'Add a skill I want to learn' }}
    </h1>

    <p v-if="loading" role="status">Loading...</p>
    <div v-else-if="blocked" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-else-if="!profileReady" class="alert alert-warning">
      Add at least one skill under "Skills I want to learn" on your profile first.
      <a href="#" @click.prevent="router.push('/profile')">Go to my profile</a>
    </div>

    <form v-else @submit.prevent="save">
      <div v-if="error" class="alert alert-danger" role="alert">
        <strong>Could not save:</strong> {{ error }}
      </div>

      <div class="mb-3">
        <label class="form-label" for="learn-skill">Skill <span class="text-danger">*</span></label>
        <select id="learn-skill" v-model="skill" class="form-select" required>
          <option disabled value="">Pick one of your skills</option>
          <option v-for="s in store.profile.skillsLearn" :key="s.name" :value="s.name">{{ s.name }}</option>
        </select>
        <small v-if="skillGenre" class="text-muted">Genre: {{ skillGenre }}</small>
      </div>

      <SkillsBasicsField
        v-model:title="title"
        v-model:description="description"
        v-model:media="media"
      />

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