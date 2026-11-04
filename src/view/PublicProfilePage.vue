<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { errorText, getPublicProfile } from '@/services/api'
import NavBar from '@/components/NavBar.vue'
import LoadingText from '@/components/LoadingText.vue'

const props = defineProps({ uid: { type: String, required: true } })
const router = useRouter()
const profile = ref(null)
const loading = ref(true)
const error = ref('')

onMounted(loadProfile)

async function loadProfile() {
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

function progressPercent(item) {
  if (!item.totalStageCount) return 0
  return Math.round((item.completedStages.length / item.totalStageCount) * 100)
}

function stageStatus(item, index) {
  if (item.stageStatuses[index] === 'approved') return 'Approved'
  if (item.stageStatuses[index] === 'pending') return 'Awaiting instructor approval'
  return 'Not started'
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}
</script>

<template>
  <NavBar />
  <main class="container py-4 public-profile">
    <button class="btn btn-link px-0 mb-3" type="button" @click="router.back()">
      &larr; Back
    </button>

    <LoadingText v-if="loading" text="Loading profile..." />
    <div v-else-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <template v-else-if="profile">
      <header class="banner p-4 p-md-5 mb-4">
        <p class="eyebrow mb-1">KONGSI MEMBER</p>
        <h1 class="h2 mb-2">{{ profile.name || 'Member' }}</h1>
        <p v-if="profile.bio" class="mb-2">{{ profile.bio }}</p>
        <p v-if="profile.region" class="small text-muted mb-0">{{ profile.region }} region</p>
      </header>

      <div class="row g-4 mb-4">
        <section class="col-12 col-lg-6">
          <div class="k-card p-4 h-100">
            <h2 class="h5">Skills I Can Teach</h2>
            <div v-if="profile.skillsTeach.length" class="skill-list">
              <div v-for="skill in profile.skillsTeach" :key="skill.name" class="skill-row">
                <strong>{{ skill.name }}</strong>
                <small class="text-muted">{{ skill.category }}</small>
              </div>
            </div>
            <p v-else class="text-muted mb-0">No teaching skills listed.</p>
          </div>
        </section>

        <section class="col-12 col-lg-6">
          <div class="k-card p-4 h-100">
            <h2 class="h5">Skills I Want to Learn</h2>
            <div v-if="profile.skillsLearn.length" class="skill-list">
              <div v-for="skill in profile.skillsLearn" :key="skill.name" class="skill-row">
                <strong>{{ skill.name }}</strong>
                <small class="text-muted">{{ skill.category }}</small>
              </div>
            </div>
            <p v-else class="text-muted mb-0">No learning skills listed.</p>
          </div>
        </section>
      </div>

      <section class="mb-4">
        <h2 class="h4 mb-3">Learning Progress</h2>
        <div v-if="profile.progress.length" class="row g-3">
          <div v-for="item in profile.progress" :key="item.bookingId" class="col-12 col-lg-6">
            <article class="k-card p-4 h-100">
              <p class="eyebrow mb-1">{{ item.category || 'COURSE' }}</p>
              <h3 class="h5">{{ item.title }}</h3>
              <div class="d-flex justify-content-between small mb-1">
                <span>Stages completed</span>
                <strong>{{ item.completedStages.length }}/{{ item.totalStageCount }}</strong>
              </div>
              <div class="progress mb-3" role="progressbar" :aria-valuenow="progressPercent(item)" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar" :style="{ width: progressPercent(item) + '%' }"></div>
              </div>
              <ul class="list-unstyled mb-0">
                <li v-for="(stage, index) in item.stageNames" :key="index" class="small py-1">
                  <span :class="item.stageStatuses[index] === 'approved' ? 'text-success' : item.stageStatuses[index] === 'pending' ? 'text-warning' : 'text-muted'">
                    {{ stageStatus(item, index) }}
                  </span>
                  · {{ stage }}
                </li>
              </ul>
            </article>
          </div>
        </div>
        <div v-else class="k-card p-4 text-muted">No active course progress to show.</div>
      </section>

      <section>
        <h2 class="h4 mb-3">Courses Completed</h2>
        <div v-if="profile.completedCourses.length" class="row g-3">
          <div v-for="course in profile.completedCourses" :key="course.name + course.dateAttained" class="col-12 col-md-6 col-xl-4">
            <article class="k-card p-4 h-100">
              <p class="eyebrow mb-1">{{ course.category || 'COMPLETED COURSE' }}</p>
              <h3 class="h5">{{ course.name }}</h3>
              <p v-if="course.courseTitle" class="small mb-1"><strong>Course:</strong> {{ course.courseTitle }}</p>
              <p v-if="course.issuer" class="small text-muted mb-2">Completed with {{ course.issuer }}</p>
              <p v-if="course.dateAttained" class="small text-muted mb-2">{{ formatDate(course.dateAttained) }}</p>
              <p v-if="course.completedStageCount" class="small text-muted mb-2">
                {{ course.completedStageCount }} stage{{ course.completedStageCount === 1 ? '' : 's' }}
              </p>
              <div v-if="course.subskills.length" class="small">
                <strong>Skills learned</strong>
                <ul class="mb-0 mt-1">
                  <li v-for="subskill in course.subskills" :key="subskill">{{ subskill }}</li>
                </ul>
              </div>
            </article>
          </div>
        </div>
        <div v-else class="k-card p-4 text-muted">No completed courses to show.</div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.public-profile {
  max-width: 1120px;
}

.skill-list {
  border-top: 1px solid var(--k-border);
}

.skill-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--k-border);
}
</style>