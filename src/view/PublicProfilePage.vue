<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { errorText, getPublicProfile } from '@/services/api'
import NavBar from '@/components/NavBar.vue'
import LoadingText from '@/components/LoadingText.vue'
import BackButton from '@/components/BackButton.vue'
import SkillCard from '@/components/SkillCard.vue'

// Another member's profile (e.g. an instructor, opened from their name on Courses or on a skill
// card). It has the same layout as my own Profile page, without the private parts (credits,
// email, edit buttons). Opening my own uid here goes to my Profile page instead.
const props = defineProps({ uid: { type: String, required: true } })
const router = useRouter()
const profile = ref(null)
const loading = ref(true)
const error = ref('')

onMounted(loadProfile)
// a link from one profile to another keeps this page open with a new uid
watch(() => props.uid, loadProfile)

async function loadProfile() {
  await auth.authStateReady()
  if (auth.currentUser && auth.currentUser.uid === props.uid) {
    router.replace('/profile')
    return
  }
  loading.value = true
  error.value = ''
  try {
    profile.value = await getPublicProfile(props.uid)
  } catch (err) {
    error.value = 'Could not load this profile: ' + errorText(err)
  } finally {
    loading.value = false
  }
}

const initials = computed(() => {
  const name = profile.value && profile.value.name ? profile.value.name.trim() : ''
  if (name === '') return '?'
  const words = name.split(' ')
  let letters = words[0][0]
  if (words.length > 1) letters += words[words.length - 1][0]
  return letters.toUpperCase()
})

function countLabel(count, item) {
  return `${count} ${item}${count === 1 ? '' : 's'}`
}

const skillFields = [
  { field: 'skillsTeach', eyebrow: 'SHARES THEIR KNOWLEDGE', label: 'Skills I Can Teach' },
  { field: 'skillsLearn', eyebrow: 'KEEPS GROWING', label: 'Skills I Want to Learn' },
]

function skillsOf(field) {
  return (profile.value && profile.value[field]) || []
}

function progressPercent(item) {
  if (!item.totalStageCount) return 0
  return Math.round((item.completedStages.length / item.totalStageCount) * 100)
}

const stageStatusLabels = {
  approved: 'Accepted',
  rejected: 'Needs rewriting',
  pending: 'Waiting for review',
  not_started: 'To write',
}
</script>

<template>
  <NavBar />
  <main class="profile-page">
    <div class="container py-4 py-md-5">
      <BackButton fallback="/courses" class="mb-3" />

      <LoadingText v-if="loading" class="mt-4" text="Loading profile..." />
      <div v-else-if="error" class="alert alert-danger mt-4" role="alert">{{ error }}</div>

      <div v-else-if="profile" class="mt-3">
        <!-- Profile header -->
        <section class="k-card k-hero p-4 p-md-5 mb-4">
          <div class="d-flex flex-column flex-md-row gap-4 align-items-md-start">
            <img v-if="profile.photo" :src="profile.photo" alt="" class="avatar" />
            <div v-else class="avatar" aria-hidden="true">{{ initials }}</div>

            <div class="flex-grow-1">
              <p class="eyebrow mb-1">COMMUNITY MEMBER</p>
              <h1 class="h3 mb-2">{{ profile.name || 'Member' }}</h1>
              <p class="mb-2 text-muted">{{ profile.bio || 'No bio yet.' }}</p>
              <span v-if="profile.region" class="small text-muted">&#128205; {{ profile.region }} region</span>
            </div>
          </div>
        </section>

        <!-- Skills -->
        <div class="row g-4 mb-4">
          <div v-for="item in skillFields" :key="item.field" class="col-12 col-lg-6">
            <section class="k-card p-4 h-100">
              <div class="mb-3">
                <p class="eyebrow mb-1">{{ item.eyebrow }}</p>
                <h2 class="h5 mb-1">{{ item.label }}</h2>
                <small class="text-muted">{{ countLabel(skillsOf(item.field).length, 'skill') }}</small>
              </div>
              <div v-if="skillsOf(item.field).length > 0">
                <div v-for="skill in skillsOf(item.field)" :key="skill.name" class="course-row">
                  <div>
                    <strong>{{ skill.name }}</strong>
                    <small class="text-muted d-block">{{ skill.category }}</small>
                  </div>
                </div>
              </div>
              <p v-else class="text-muted small mb-0">No skills listed.</p>
            </section>
          </div>
        </div>

        <!-- Courses they teach -->
        <section class="k-card p-4 mb-4">
          <div class="mb-3">
            <p class="eyebrow mb-1">THEIR COURSES</p>
            <h2 class="h5 mb-1">Courses I Teach</h2>
            <small class="text-muted">{{ countLabel(profile.courses.length, 'course') }}</small>
          </div>
          <p v-if="profile.courses.length === 0" class="text-muted small mb-0">No courses yet.</p>
          <div v-for="course in profile.courses" :key="course.id" class="course-row">
            <div class="min-w-0">
              <strong>{{ course.title }}</strong>
              <small class="text-muted d-block">
                {{ course.category }} &middot;
                {{ course.mode === 'online' ? 'Online' : course.region + (course.place ? ' - ' + course.place : '') }}
                &middot; {{ course.creditCost }} credit{{ course.creditCost === 1 ? '' : 's' }}
              </small>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary flex-shrink-0" @click="router.push('/courses')">
              Find on Courses
            </button>
          </div>
        </section>

        <!-- Learning progress: only shown to the member themself and their instructor -->
        <section v-if="profile.progress.length" class="mb-4">
          <p class="eyebrow mb-1">IN PROGRESS</p>
          <h2 class="h4 mb-3">Learning Progress</h2>
          <div class="row g-3">
            <div v-for="item in profile.progress" :key="item.bookingId" class="col-12 col-lg-6">
              <article class="k-card p-4 h-100">
                <p class="eyebrow mb-1">{{ item.category || 'COURSE' }}</p>
                <h3 class="h5">{{ item.title }}</h3>
                <div class="d-flex justify-content-between small mb-1">
                  <span>Reflections accepted</span>
                  <strong>{{ item.completedStages.length }}/{{ item.totalStageCount }}</strong>
                </div>
                <div class="progress mb-3" role="progressbar" :aria-valuenow="progressPercent(item)" aria-valuemin="0" aria-valuemax="100">
                  <div class="progress-bar" :style="{ width: progressPercent(item) + '%' }"></div>
                </div>
                <ul class="list-unstyled mb-0">
                  <li v-for="(stage, index) in item.stageNames" :key="index" class="small py-1">
                    {{ stage }} &middot; <span class="text-muted">{{ stageStatusLabels[item.stageStatuses[index]] }}</span>
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <!-- Skill cards (earned by finishing courses) -->
        <section>
          <p class="eyebrow mb-1">THEIR LEARNING JOURNEY</p>
          <h2 class="h4 mb-3">Skill Cards</h2>
          <div v-if="profile.completedCourses.length > 0" class="row g-4">
            <div v-for="card in profile.completedCourses" :key="card.id || card.name + card.dateAttained" class="col-12 col-md-6 col-xl-4">
              <SkillCard :skill="card" />
            </div>
          </div>
          <div v-else class="k-card p-4 text-center text-muted">No skill cards yet.</div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* The same look as the Profile page. The colours, and the classes k-card and eyebrow, come from
   src/assets/theme.css */
.profile-page {
  color: var(--k-text);
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

.course-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--k-border);
}
</style>
