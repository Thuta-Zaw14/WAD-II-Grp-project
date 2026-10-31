<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { useProfileStore } from '../stores/profile'
import SkillCard from '../components/SkillCard.vue'

const router = useRouter()
const store = useProfileStore()

// ---------- Load everything from the server ----------
async function loadPage() {
  await auth.authStateReady() // wait until Firebase has restored the login
  if (!auth.currentUser) {
    router.push('/login')
    return
  }
  await store.fetchProfile()
  if (store.error) return // no point asking for more if this failed
  await store.fetchOptions()
  if (store.error) return
  await store.fetchSkillCards()
}

onMounted(loadPage)

// ---------- Values worked out from the profile ----------
// A skill looks like { name: 'Badminton', category: 'Sports' }.
// (older profiles may not have the lists yet, so there is a fallback)
function skillsOf(field) {
  return store.profile[field] || []
}

const initials = computed(() => {
  const name = store.profile && store.profile.name ? store.profile.name.trim() : ''
  if (name === '') return '?'
  const words = name.split(' ')
  let letters = words[0][0]
  if (words.length > 1) {
    letters += words[words.length - 1][0]
  }
  return letters.toUpperCase()
})

// ---------- Editing ----------
const maxSkills = 15 // per list (the server checks too)
const isEditing = ref(false)
const formError = ref('')

// the form works on a copy, so Cancel leaves the real profile untouched
const draft = reactive({ name: '', bio: '', region: '', skillsTeach: [], skillsLearn: [] })

// what is typed in the "add a skill" row of each list
const newName = reactive({ skillsTeach: '', skillsLearn: '' })
const newCategory = reactive({ skillsTeach: '', skillsLearn: '' })

const skillFields = [
  { field: 'skillsTeach', eyebrow: 'SHARE YOUR KNOWLEDGE', label: 'Skills I can teach' },
  { field: 'skillsLearn', eyebrow: 'KEEP GROWING', label: 'Skills I want to learn' },
]

function openEditor() {
  draft.name = store.profile.name || ''
  draft.bio = store.profile.bio || ''
  draft.region = store.profile.region || ''
  // copy each skill object too, so removing or adding in the form never touches the real profile
  draft.skillsTeach = skillsOf('skillsTeach').map((skill) => ({ ...skill }))
  draft.skillsLearn = skillsOf('skillsLearn').map((skill) => ({ ...skill }))
  for (const item of skillFields) {
    newName[item.field] = ''
    newCategory[item.field] = ''
  }
  formError.value = ''
  isEditing.value = true
}

function closeEditor() {
  isEditing.value = false
}

// Add the typed skill to one of the two lists
function addSkill(field) {
  formError.value = ''

  // squeeze extra spaces: "Photo   editing " -> "Photo editing"
  const name = newName[field].trim().split(/\s+/).join(' ')
  if (name === '') {
    formError.value = 'Type a skill first.'
    return
  }
  if (name.length > 40) {
    formError.value = 'A skill name must be 40 characters or fewer.'
    return
  }
  if (newCategory[field] === '') {
    formError.value = 'Pick a genre for "' + name + '".'
    return
  }
  if (draft[field].length >= maxSkills) {
    formError.value = 'You can add up to ' + maxSkills + ' skills in each list.'
    return
  }
  for (const skill of draft[field]) {
    if (skill.name.toLowerCase() === name.toLowerCase()) {
      formError.value = '"' + name + '" is already in this list.'
      return
    }
  }

  draft[field].push({ name: name, category: newCategory[field] })
  newName[field] = '' // keep the genre selected, people often add several of one genre
}

function removeSkill(field, index) {
  draft[field].splice(index, 1)
}

async function save() {
  formError.value = ''

  // quick checks so people get instant feedback (the server checks again)
  const name = draft.name.trim()
  if (name === '') {
    formError.value = 'Please enter your name.'
    return
  }
  if (name.length > 60) {
    formError.value = 'Your name must be 60 characters or fewer.'
    return
  }
  if (draft.bio.length > 300) {
    formError.value = 'Your bio must be 300 characters or fewer.'
    return
  }
  for (const item of skillFields) {
    if (newName[item.field].trim() !== '') {
      formError.value = 'You typed "' + newName[item.field].trim() + '" but did not press Add.'
      return
    }
  }

  const saved = await store.saveProfile({
    name: name,
    bio: draft.bio.trim(),
    region: draft.region,
    skillsTeach: draft.skillsTeach,
    skillsLearn: draft.skillsLearn,
  })

  if (saved) {
    isEditing.value = false
  } else {
    formError.value = store.saveError
  }
}
</script>
<template>
  <main class="profile-page min-vh-100">
    <div class="container py-4 py-md-5">
      <a href="#" class="back-link text-decoration-none small" @click.prevent="router.push('/home')">
        &larr; Back to home
      </a>

      <p v-if="store.loading" class="text-muted mt-4">Loading your profile...</p>

      <div
        v-else-if="store.error"
        class="alert alert-danger mt-4 d-flex justify-content-between align-items-center gap-3"
      >
        <span>{{ store.error }}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" @click="loadPage">Try again</button>
      </div>

      <div v-else-if="store.profile" class="mt-3">
        <div v-if="!store.profile.name" class="alert alert-warning">
          Welcome to Kongsi! Add your name and pick your skills to get started.
        </div>

        <!-- Profile header -->
        <section class="k-card k-hero p-4 p-md-5 mb-4">
          <div class="d-flex flex-column flex-md-row gap-4 align-items-md-start">
            <div class="avatar">{{ initials }}</div>

            <div class="flex-grow-1">
              <p class="eyebrow mb-1">COMMUNITY MEMBER</p>
              <h1 class="h3 mb-2">{{ store.profile.name || 'Add your name' }}</h1>
              <p class="mb-2 text-muted">
                {{ store.profile.bio || 'Add a short bio so people know who they are learning with.' }}
              </p>
              <span class="small text-muted">
                &#128205; {{ store.profile.region ? store.profile.region + ' region' : 'Region not set' }}
              </span>
              <span class="small text-muted ms-3">{{ store.profile.email }}</span>
            </div>

            <!-- disabled until the skill list has arrived, because the form needs it -->
            <button
              type="button"
              class="btn btn-kongsi"
              :disabled="store.categories.length === 0"
              @click="openEditor"
            >
              Edit profile
            </button>
          </div>
        </section>

        <!-- Credits -->
        <section class="credits-card rounded-4 p-4 mb-4 d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <p class="eyebrow mb-1">YOUR SKILL EXCHANGE BALANCE</p>
            <h2 class="h4 mb-1">Time credits</h2>
            <p class="mb-0 small">Teach a skill to earn credits, then spend them learning something new.</p>
          </div>
          <div class="text-center">
            <div class="display-5 fw-bold">{{ store.credits }}</div>
            <div class="small">AVAILABLE</div>
          </div>
        </section>

        <!-- Skills -->
                <!-- Skills -->
        <div class="row g-4 mb-4">
          <div v-for="item in skillFields" :key="item.field" class="col-12 col-lg-6">
            <section class="k-card p-4 h-100">
              <p class="eyebrow mb-1">{{ item.eyebrow }}</p>
              <h2 class="h5">{{ item.label }}</h2>
              <div class="d-flex flex-wrap gap-2 mt-3">
                <span
                  v-for="skill in skillsOf(item.field)"
                  :key="skill.name"
                  class="chip"
                  :class="'cat-' + skill.category"
                >
                  {{ skill.name }}
                </span>
                <p v-if="skillsOf(item.field).length === 0" class="text-muted small mb-0">
                  No skills yet. Use "Edit profile" to add some.
                </p>
              </div>
            </section>
          </div>
        </div>

        <!-- Skill cards (earned after finishing sessions) -->
        <section>
          <p class="eyebrow mb-1">YOUR LEARNING JOURNEY</p>
          <h2 class="h4 mb-3">My skill cards</h2>

          <div v-if="store.skillCards.length > 0" class="row g-4">
            <div v-for="card in store.skillCards" :key="card.id" class="col-12 col-md-6 col-xl-4">
              <SkillCard :skill="card" />
            </div>
          </div>

          <div v-else class="k-card p-4 text-center text-muted">
            No skill cards yet. They will appear here after you finish a session.
          </div>
        </section>
      </div>
    </div>

    <!-- Edit profile -->
    <div v-if="isEditing" class="modal-overlay" @click.self="closeEditor">
      <section class="k-card edit-modal p-4" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <h2 id="edit-title" class="h4 mb-0">Edit profile</h2>
          <button type="button" class="btn-close" aria-label="Close" @click="closeEditor"></button>
        </div>

        <form @submit.prevent="save">
          <div class="mb-3">
            <label for="profile-name" class="form-label">Display name</label>
            <input
              id="profile-name"
              v-model.trim="draft.name"
              type="text"
              class="form-control"
              maxlength="60"
              required
            />
          </div>

          <div class="mb-3">
            <label for="profile-bio" class="form-label">About me</label>
            <textarea
              id="profile-bio"
              v-model="draft.bio"
              class="form-control"
              rows="3"
              maxlength="300"
            ></textarea>
            <small class="text-muted">{{ draft.bio.length }}/300</small>
          </div>

          <div class="mb-3">
            <label for="profile-region" class="form-label">Region</label>
            <select id="profile-region" v-model="draft.region" class="form-select">
              <option value="">Prefer not to say</option>
              <option v-for="r in store.regions" :key="r" :value="r">{{ r }}</option>
            </select>
            <small class="text-muted">Only your region is shown, never your address.</small>
          </div>
          <fieldset v-for="item in skillFields" :key="item.field" class="mb-3">
            <legend class="form-label fs-6">{{ item.label }}</legend>

            <!-- the skills added so far; the x removes one -->
            <div class="d-flex flex-wrap gap-2 mb-2">
              <span
                v-for="(skill, index) in draft[item.field]"
                :key="skill.name"
                class="chip"
                :class="'cat-' + skill.category"
              >
                {{ skill.name }}
                <button
                  type="button"
                  class="chip-remove"
                  :aria-label="'Remove ' + skill.name"
                  @click="removeSkill(item.field, index)"
                >
                  &times;
                </button>
              </span>
              <small v-if="draft[item.field].length === 0" class="text-muted">None yet</small>
            </div>

                        <!-- type a skill, pick its genre, press Add (or the Enter key) -->
            <div class="d-flex flex-wrap gap-2">
              <input
                v-model="newName[item.field]"
                type="text"
                class="form-control skill-input"
                maxlength="40"
                placeholder="Type a skill, e.g. Badminton"
                :aria-label="'Add to: ' + item.label"
                @keydown.enter.prevent="addSkill(item.field)"
              />
              <select v-model="newCategory[item.field]" class="form-select genre-select" aria-label="Genre">
                <option disabled value="">Genre</option>
                <option v-for="c in store.categories" :key="c" :value="c">{{ c }}</option>
              </select>
              <button type="button" class="btn btn-outline-secondary" @click="addSkill(item.field)">Add</button>
            </div>
          </fieldset>

          <p v-if="formError" class="text-danger small fw-semibold" role="alert">{{ formError }}</p>

          <div class="d-flex justify-content-end gap-2 mt-4">
            <button type="button" class="btn btn-outline-secondary" @click="closeEditor">Cancel</button>
            <button type="submit" class="btn btn-kongsi" :disabled="store.saving">
              {{ store.saving ? 'Saving...' : 'Save changes' }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
/* Classes starting with "k-" and the colours come from src/assets/theme.css.
   When the shared stylesheet exists, k-card, btn-kongsi, eyebrow and chip
   are the ones to move there. */
.profile-page {
  background: var(--k-bg);
  color: var(--k-text);
}

.back-link {
  color: var(--k-muted);
}

.k-card {
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius);
}

.k-hero {
  background: var(--k-surface-alt);
}

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: var(--k-muted);
}

.avatar {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-size: 26px;
  font-weight: 700;
}

.btn-kongsi {
  background: var(--k-accent);
  border: 1px solid var(--k-accent);
  color: var(--k-on-accent);
}

.btn-kongsi:hover:not(:disabled) {
  background: var(--k-accent-hover);
  color: var(--k-on-accent);
}

.credits-card {
  background: var(--k-accent);
  color: var(--k-on-accent);
}

.credits-card .eyebrow {
  color: inherit;
  opacity: 0.75;
}

.chip {
  padding: 6px 12px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  color: var(--chip-color, var(--k-accent));
  background: color-mix(in srgb, var(--chip-color, var(--k-accent)) 12%, white);
  border: 1px solid color-mix(in srgb, var(--chip-color, var(--k-accent)) 30%, white);
}

.cat-Sports { --chip-color: var(--k-cat-sports); }
.cat-Creative { --chip-color: var(--k-cat-creative); }
.cat-Music { --chip-color: var(--k-cat-music); }
.cat-Tech { --chip-color: var(--k-cat-tech); }


.chip-remove {
  margin-left: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.skill-input {
  flex: 1 1 10rem;
  min-width: 0;
}

/* on a phone the typing box gets a whole row; genre and Add sit under it */
@media (max-width: 575.98px) {
  .skill-input {
    flex-basis: 100%;
  }
}

.genre-select {
  flex: 0 0 8.5rem;
  width: 8.5rem;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(35, 29, 21, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.edit-modal {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
}
</style>