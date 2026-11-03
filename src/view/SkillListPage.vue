<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth } from '@/firebase'
import { useProfileStore } from '@/stores/profile'
import NavBar from '@/components/NavBar.vue'
import BackButton from '@/components/BackButton.vue'
import { usePreviousPage } from '@/services/previousPage'
import LoadingText from '@/components/LoadingText.vue'
import { useToastStore } from '@/stores/toast'
import { findSkillNameProblem, squeezeSpaces } from '@/services/skillRules'

const props = defineProps({ kind: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
// saving and cancelling go back to where you came from (normally Profile)
const { goBack: goToPreviousPage } = usePreviousPage('/profile')
const store = useProfileStore()
const toast = useToastStore()

const field = computed(() => props.kind === 'teach' ? 'skillsTeach' : 'skillsLearn')
const pageTitle = computed(() => props.kind === 'teach' ? 'Skills I Can Teach' : 'Skills I Want to Learn')
const list = ref([])
const skillName = ref('')
const category = ref('')
const editingSkill = ref('')
const loading = ref(true)
const loadError = ref('')
const summaryError = ref('')
const fieldErrors = reactive({ name: '', category: '' })
const touched = reactive({ name: false, category: false })
const submitAttempted = ref(false)
const maxSkills = 15

onMounted(loadPage)

async function loadPage() {
  await auth.authStateReady()
  if (!auth.currentUser) {
    router.push('/login')
    return
  }

  await store.fetchProfile()
  if (!store.error) await store.fetchOptions()

  if (store.error) {
    loadError.value = store.error
    loading.value = false
    return
  }

  list.value = (store.profile[field.value] || []).map((skill) => ({ ...skill }))
  const requestedSkill = typeof route.query.edit === 'string' ? route.query.edit : ''
  const selectedSkill = list.value.find(
    (skill) => skill.name.toLowerCase() === requestedSkill.toLowerCase()
  )
  if (selectedSkill) {
    editingSkill.value = selectedSkill.name
    skillName.value = selectedSkill.name
    category.value = selectedSkill.category
  }
  loading.value = false
}

function pickKnownGenre() {
  const typed = skillName.value.trim().toLowerCase()
  const known = store.knownSkills.find((skill) => skill.name.toLowerCase() === typed)
  if (known) category.value = known.category
}

function editingIndex() {
  return editingSkill.value
    ? list.value.findIndex((skill) => skill.name.toLowerCase() === editingSkill.value.toLowerCase())
    : -1
}

function validateSkillName() {
  const name = squeezeSpaces(skillName.value)
  if (!name) return 'Skill name is required.'
  if (name.length > 40) return 'A skill name must be 40 characters or fewer.'

  const nameProblem = findSkillNameProblem(name)
  if (nameProblem) return nameProblem

  const index = editingIndex()
  if (editingSkill.value && index === -1) return 'This skill is no longer in the list. Reload the page and try again.'
  if (index === -1 && list.value.length >= maxSkills) return `You can add up to ${maxSkills} skills in this list.`
  if (list.value.some((skill, index) =>
    index !== editingIndex() && skill.name.toLowerCase() === name.toLowerCase()
  )) return `"${name}" is already in this list.`

  return ''
}

function validateCategory() {
  return category.value ? '' : 'Category is required.'
}

function onSkillNameInput() {
  pickKnownGenre()
  touched.name = true
  fieldErrors.name = validateSkillName()
  if (touched.category) fieldErrors.category = validateCategory()
  if (submitAttempted.value) validateForm()
  else summaryError.value = ''
}

function onCategoryChange() {
  touched.category = true
  fieldErrors.category = validateCategory()
  if (touched.name) fieldErrors.name = validateSkillName()
  if (submitAttempted.value) validateForm()
  else summaryError.value = ''
}

function validateForm() {
  submitAttempted.value = true
  touched.name = true
  touched.category = true
  fieldErrors.name = validateSkillName()
  fieldErrors.category = validateCategory()

  const invalidFields = []
  if (fieldErrors.name) invalidFields.push('Skill name')
  if (fieldErrors.category) invalidFields.push('Category')

  summaryError.value = invalidFields.length
    ? `Please correct these fields: ${invalidFields.join(' and ')}.`
    : ''
  return invalidFields.length === 0
}

async function saveSkills() {
  if (!validateForm()) return

  const name = squeezeSpaces(skillName.value)
  const index = editingIndex()
  const updatedSkills = [...list.value]
  const updatedSkill = { name, category: category.value }
  if (index === -1) updatedSkills.push(updatedSkill)
  else updatedSkills[index] = updatedSkill

  const saved = await store.saveProfile({ [field.value]: updatedSkills })
  if (saved) {
    toast.show('Skills saved.')
    goToPreviousPage()
  } else {
    summaryError.value = store.saveError || 'Could not save your skills. Please try again.'
  }
}
</script>

<template>
  <NavBar />

  <main class="container py-4" style="max-width: 760px">
    <BackButton fallback="/profile" class="mb-3" />

    <LoadingText v-if="loading" />
    <div v-else-if="loadError" class="alert alert-danger" role="alert">
      {{ loadError }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="loadPage">Try again</button>
    </div>

    <section v-else class="k-card k-form-card p-4">
      <p class="eyebrow mb-1">PROFILE SKILLS</p>
      <h1 class="h4 mb-4">{{ pageTitle }}</h1>

      <form novalidate @submit.prevent="saveSkills">
        <div class="mb-3">
          <div class="row g-3">
            <div class="col-12 col-sm-8">
              <label class="form-label" for="skill-name">
                {{ editingSkill ? 'Edit skill' : 'Skill name' }} <span class="required-marker" aria-hidden="true">*</span>
              </label>
              <input
                id="skill-name"
                v-model="skillName"
                type="text"
                class="form-control"
                :class="{ 'is-invalid': touched.name && fieldErrors.name }"
                :aria-invalid="touched.name && !!fieldErrors.name"
                :aria-describedby="touched.name && fieldErrors.name ? 'skill-name-error' : undefined"
                maxlength="40"
                placeholder="Type a skill, e.g. Badminton"
                list="known-skills"
                autocomplete="off"
                required
                @input="onSkillNameInput"
                @blur="touched.name = true; fieldErrors.name = validateSkillName()"
              />
              <datalist id="known-skills">
                <option v-for="skill in store.knownSkills" :key="skill.name" :value="skill.name" />
              </datalist>
              <div v-if="touched.name && fieldErrors.name" id="skill-name-error" class="invalid-feedback d-block">
                {{ fieldErrors.name }}
              </div>
            </div>
            <div class="col-12 col-sm-4">
              <label class="form-label" for="skill-category">
                Category <span class="required-marker" aria-hidden="true">*</span>
              </label>
              <select
                id="skill-category"
                v-model="category"
                class="form-select"
                :class="{ 'is-invalid': touched.category && fieldErrors.category }"
                :aria-invalid="touched.category && !!fieldErrors.category"
                :aria-describedby="touched.category && fieldErrors.category ? 'skill-category-error' : undefined"
                required
                @change="onCategoryChange"
                @blur="touched.category = true; fieldErrors.category = validateCategory()"
              >
                <option disabled value="">Choose a category</option>
                <option v-for="item in store.categories" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
              <div v-if="touched.category && fieldErrors.category" id="skill-category-error" class="invalid-feedback d-block">
                {{ fieldErrors.category }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="summaryError" class="alert alert-danger" role="alert" aria-live="assertive">
          {{ summaryError }}
        </div>

        <div class="d-flex justify-content-end gap-2 mt-4">
          <button type="button" class="btn btn-outline-secondary" @click="goToPreviousPage">
            Cancel
          </button>
          <button type="submit" class="btn btn-kongsi" :disabled="store.saving">
            {{ store.saving ? 'Saving...' : 'Save Skills' }}
          </button>
        </div>
      </form>
    </section>
  </main>
</template>

<style scoped>
.required-marker {
  color: #dc3545;
  font-weight: 700;
}

</style>