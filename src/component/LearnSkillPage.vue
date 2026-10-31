<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { waitForUser } from '@/services/currentUser'
import { ensureUserProfile, saveUserSkill, deleteUserSkill } from '@/services/skills'
import { uploadPending, deleteMany, collectPaths } from '@/services/storage'
import SkillsBasicsField from '@/component/SkillsBasicsField.vue'

const props = defineProps({ id: { type: String, default: null } })
const router = useRouter()
const isEdit = computed(() => !!props.id)

let uid = null
let profile = null
let original = null

const title = ref('')
const description = ref('')
const media = ref([])

const loading = ref(true)
const blocked = ref(false)
const saving = ref(false)
const error = ref('')

onMounted(async () => {
  const user = await waitForUser()
  if (!user) return router.push('/login')
  uid = user.uid

  try {
    profile = await ensureUserProfile(user)

    if (props.id) {
      const s = (profile.skillsLearn || []).find(
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
    }
  } catch (e) {
    blocked.value = true
    error.value = 'Could not load this page. Please try again.'
    console.error(e)
  } finally {
    loading.value = false
  }
})

async function save() {
  error.value = ''
  if (!title.value.trim()) {
    error.value = 'Please enter a title.'
    return
  }

  saving.value = true
  const uploaded = []

  try {
    const mediaOut = await uploadPending(media.value, uid, uploaded)

    await saveUserSkill({
      uid,
      kind: 'learn',
      skill: {
        title: title.value.trim(),
        description: description.value.trim(),
        media: mediaOut,
      },
      originalTitle: original?.title,
    })

    if (original) {
      const keep = new Set(collectPaths(mediaOut))
      await deleteMany(collectPaths(original.media).filter((p) => !keep.has(p)))
    }

    router.push('/profile')
  } catch (e) {
    await deleteMany(uploaded)
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm(`Remove "${original.title}" from your learning list?`)) return
  error.value = ''
  try {
    const removed = await deleteUserSkill({ uid, kind: 'learn', title: original.title })
    await deleteMany(collectPaths(removed.media))
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
    <h1 class="h4 mb-3">
      {{ isEdit ? 'Edit skill I want to learn' : 'Add a skill I want to learn' }}
    </h1>

    <p v-if="loading" role="status">Loading...</p>
    <div v-else-if="blocked" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <form v-else @submit.prevent="save">
      <div v-if="error" class="alert alert-danger" role="alert">
        <strong>Could not save:</strong> {{ error }}
      </div>

      <SkillsBasicsField
        v-model:title="title"
        v-model:description="description"
        v-model:media="media"
      />

      <div class="d-flex gap-2">
        <button class="btn btn-brand" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save skill' }}
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