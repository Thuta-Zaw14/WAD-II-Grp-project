<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'
import SkillCard from '../components/SkillCard.vue'
import NavBar from '../components/NavBar.vue'
import LoadingText from '../components/LoadingText.vue'
import EditProfileModal from '../components/EditProfileModal.vue'

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
  await store.fetchMyCourses()
}

onMounted(loadPage)

// ---------- Values worked out from the profile ----------
// A skill looks like { name: 'Badminton', category: 'Sports' }.
// (older profiles may not have the lists yet, so there is a fallback)
function skillsOf(field) {
  return store.profile[field] || []
}

function countLabel(count, item) {
  return `${count} ${item}${count === 1 ? '' : 's'}`
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

// ---------- Editing (the popup lives in EditProfileModal.vue) ----------
const isEditing = ref(false)

const skillFields = [
  { field: 'skillsTeach', eyebrow: 'SHARE YOUR KNOWLEDGE', label: 'Skills I Can Teach' },
  { field: 'skillsLearn', eyebrow: 'KEEP GROWING', label: 'Skills I Want to Learn' },
]

// ---------- Removing a skill ----------
// The server refuses if one of my courses (teach) or learning goals (learn) still uses
// the skill, and its message is shown in that card.
const toast = useToastStore()
const removeErrors = reactive({ skillsTeach: '', skillsLearn: '' })

async function removeSkill(item, skill) {
  if (!confirm('Remove "' + skill.name + '" from ' + item.label + '?')) return
  removeErrors[item.field] = ''
  const rest = skillsOf(item.field).filter((s) => s.name !== skill.name)
  const saved = await store.saveProfile({ [item.field]: rest })
  if (saved) {
    toast.show('"' + skill.name + '" removed.')
  } else {
    removeErrors[item.field] = store.saveError
  }
}
</script>

<template>
  <NavBar />
  <main class="profile-page">
    <div class="container py-4 py-md-5">
      <a href="#" class="back-link text-decoration-none small" @click.prevent="router.push('/home')">
        &larr; Back to home
      </a>

      <LoadingText v-if="store.loading" class="mt-4" text="Loading your profile..." />

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
            <img v-if="store.profile.photo" :src="store.profile.photo" alt="" class="avatar" />
            <div v-else class="avatar">{{ initials }}</div>

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

            <button
              type="button"
              class="btn btn-kongsi"
              @click="isEditing = true"
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
        <div class="row g-4 mb-4">
          <div v-for="item in skillFields" :key="item.field" class="col-12 col-lg-6">
            <section class="k-card p-4 h-100">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
                <div>
                  <p class="eyebrow mb-1">{{ item.eyebrow }}</p>
                  <h2 class="h5 mb-1">{{ item.label }}</h2>
                  <small class="text-muted">{{ countLabel(skillsOf(item.field).length, 'skill') }}</small>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-kongsi"
                  @click="router.push(item.field === 'skillsTeach' ? '/skills/teach' : '/skills/learn')"
                >
                  + Add Skills
                </button>
              </div>
              <div v-if="skillsOf(item.field).length > 0">
                <div v-for="skill in skillsOf(item.field)" :key="skill.name" class="course-row">
                  <div>
                    <strong>{{ skill.name }}</strong>
                    <small class="text-muted d-block">{{ skill.category }}</small>
                  </div>
                  <div class="d-flex gap-2">
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-secondary"
                      @click="router.push({
                        path: item.field === 'skillsTeach' ? '/skills/teach' : '/skills/learn',
                        query: { edit: skill.name },
                      })"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-danger"
                      :disabled="store.saving"
                      :aria-label="'Remove ' + skill.name"
                      @click="removeSkill(item, skill)"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
              <p v-else class="text-muted small mb-0">No skills yet.</p>
              <div v-if="removeErrors[item.field]" class="alert alert-danger small mt-3 mb-0" role="alert">
                {{ removeErrors[item.field] }}
              </div>
            </section>
          </div>
        </div>

        <!-- Courses I teach and goals I am working towards -->
        <div class="row g-4 mb-4">
          <div class="col-12 col-lg-6">
            <section class="k-card p-4 h-100">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
                <div>
                  <p class="eyebrow mb-1">YOUR COURSES</p>
                  <h2 class="h5 mb-1">Courses I Teach</h2>
                  <small class="text-muted">{{ countLabel(store.myOffers.length, 'course') }}</small>
                </div>
                <button type="button" class="btn btn-sm btn-kongsi" @click="router.push('/teach/new')">
                  + Add a course
                </button>
              </div>

              <p v-if="store.myOffers.length === 0" class="text-muted small mb-0">
                No courses yet. Add a skill under "Skills I Can Teach", then offer a course.
              </p>
              <div v-for="offer in store.myOffers" :key="offer.id" class="course-row">
                <div>
                  <strong>{{ offer.title }}</strong>
                  <small class="text-muted d-block">
                    {{ offer.category }} &middot;
                    {{ offer.mode === 'online' ? 'Online' : offer.region + ' - ' + offer.place }}
                    &middot; {{ (offer.slots ?? []).length }} start time{{ (offer.slots ?? []).length === 1 ? '' : 's' }}
                  </small>
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="router.push('/teach/' + offer.id)">
                  Edit
                </button>
              </div>
            </section>
          </div>

          <div class="col-12 col-lg-6">
            <section class="k-card p-4 h-100">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
                <div>
                  <p class="eyebrow mb-1">YOUR GOALS</p>
                  <h2 class="h5 mb-1">What I Want to Learn</h2>
                  <small class="text-muted">{{ countLabel(store.myGoals.length, 'goal') }}</small>
                </div>
                <button type="button" class="btn btn-sm btn-kongsi" @click="router.push('/learn/new')">
                  + Add a goal
                </button>
              </div>

              <p v-if="store.myGoals.length === 0" class="text-muted small mb-0">
                No learning goals yet. Add a skill under "Skills I Want to Learn", then describe your goal.
              </p>
              <div v-for="goal in store.myGoals" :key="goal.id" class="course-row">
                <div>
                  <strong>{{ goal.title }}</strong>
                  <small class="text-muted d-block">{{ goal.category }} &middot; {{ goal.skill }}</small>
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="router.push('/learn/' + goal.id)">
                  Edit
                </button>
              </div>
            </section>
          </div>
        </div>

        <!-- Skill cards (earned after finishing sessions) -->
        <section>
          <p class="eyebrow mb-1">YOUR LEARNING JOURNEY</p>
          <h2 class="h4 mb-3">My Skill Cards</h2>

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

    <EditProfileModal v-if="isEditing" @close="isEditing = false" />
  </main>
</template>

<style scoped>
/* The colours, and the classes k-card, btn-kongsi and eyebrow, come from src/assets/theme.css */
.profile-page {
  color: var(--k-text);
}

.back-link {
  color: var(--k-muted);
}

.k-hero {
  background: var(--k-surface-alt);
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
  object-fit: cover;
}

.credits-card {
  background: var(--k-accent);
  color: var(--k-on-accent);
}

.credits-card .eyebrow {
  color: inherit;
  opacity: 0.75;
}

.course-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--k-border);
}
</style>
