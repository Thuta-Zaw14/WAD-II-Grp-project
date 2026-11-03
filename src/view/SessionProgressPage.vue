<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth } from '@/firebase'
import { useBookingsStore } from '@/stores/bookings'
import NavBar from '@/components/NavBar.vue'
import BackButton from '@/components/BackButton.vue'
import LoadingText from '@/components/LoadingText.vue'

const route = useRoute()
const router = useRouter()
const store = useBookingsStore()
const loading = ref(true)
const loadError = ref('')
const reflections = ref([])
const reflectionErrors = ref([])
const submitError = ref('')
let refreshTimer = null

const booking = computed(() => store.bookings.find((item) => item.id === route.params.id) || null)
const isLearner = computed(() => booking.value?.role === 'learner')
const isActive = computed(() => booking.value?.status === 'booked')
const approvedCount = computed(() => booking.value?.stageProgress?.filter((stage) => stage.approved).length || 0)
const stageCount = computed(() => booking.value?.totalStageCount ?? booking.value?.stageNames?.length ?? 0)
const progressPercent = computed(() => stageCount.value
  ? Math.round((approvedCount.value / stageCount.value) * 100)
  : 0
)

let unmounted = false // the page can be left while loadBooking is still waiting
// the reflection text the server had when we last looked, per stage
let serverReflections = []

onMounted(loadBooking)
onUnmounted(() => {
  unmounted = true
  clearInterval(refreshTimer)
})

// Take the server's text for a stage unless the user has typed something of their own there.
function syncReflectionInputs() {
  const stages = booking.value?.stageProgress || []
  for (let index = 0; index < stages.length; index++) {
    const fromServer = stages[index].reflection || ''
    const untouched = reflections.value[index] === undefined || reflections.value[index] === serverReflections[index]
    if (untouched) {
      reflections.value[index] = fromServer
      reflectionErrors.value[index] = ''
    }
    serverReflections[index] = fromServer
  }
}

async function loadBooking() {
  await auth.authStateReady()
  if (unmounted) return
  if (!auth.currentUser) {
    router.push('/login')
    return
  }

  await store.fetchBookings()
  if (unmounted) return
  if (store.error) {
    loadError.value = store.error
  } else if (!booking.value) {
    loadError.value = 'This course progress is not available to your account.'
  } else {
    reflections.value = booking.value.stageProgress.map((stage) => stage.reflection || '')
    serverReflections = [...reflections.value]
    reflectionErrors.value = booking.value.stageProgress.map(() => '')
    refreshTimer = setInterval(async () => {
      if (document.hidden) return
      await store.refreshBookings()
      syncReflectionInputs()
    }, 15000)
  }
  loading.value = false
}

async function submitReflection(index) {
  submitError.value = ''
  const reflection = (reflections.value[index] || '').trim()
  if (!reflection) {
    reflectionErrors.value[index] = 'Write a reflection before submitting this stage.'
    return
  }
  if (reflection.length > 2000) {
    reflectionErrors.value[index] = 'Keep your reflection to 2000 characters or fewer.'
    return
  }

  reflectionErrors.value[index] = ''
  const saved = await store.submitReflection(booking.value.id, index, reflection)
  if (!saved) submitError.value = store.actionError
  else syncReflectionInputs()
}

async function approveStage(index) {
  submitError.value = ''
  const approved = await store.approveStage(booking.value.id, index)
  if (!approved) submitError.value = store.actionError
  else syncReflectionInputs()
}

function stageStatus(stage) {
  if (stage.approved) return 'Approved'
  if (stage.reflection) return 'Awaiting instructor approval'
  return 'Not started'
}
</script>

<template>
  <NavBar />
  <main class="container py-4 progress-page">
    <BackButton fallback="/classes" class="mb-3" />

    <LoadingText v-if="loading" text="Loading course progress..." />
    <div v-else-if="loadError" class="alert alert-danger" role="alert">
      {{ loadError }}
    </div>

    <template v-else-if="booking">
      <header class="banner p-4 mb-4">
        <p class="eyebrow mb-1">COURSE PROGRESS</p>
        <h1 class="h3 mb-2">{{ booking.title }}</h1>
        <p class="text-muted mb-3">
          {{ isLearner ? 'Instructor: ' + booking.teacherName : 'Learner: ' + booking.learnerName }}
        </p>
        <div class="d-flex justify-content-between small mb-1">
          <span>Approved stages</span>
          <strong>{{ approvedCount }} of {{ stageCount }}</strong>
        </div>
        <div class="progress" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <p v-if="approvedCount < stageCount" class="small text-muted mt-3 mb-0">
          The next stage appears after the instructor approves the current stage.
        </p>
      </header>

      <div v-if="submitError" class="alert alert-danger" role="alert" aria-live="assertive">
        {{ submitError }}
      </div>

      <section aria-labelledby="stages-heading">
        <h2 id="stages-heading" class="h5 mb-3">Course Stages</h2>
        <div class="stage-list">
          <article v-for="(stageName, index) in booking.stageNames" :key="index" class="k-card stage-item p-4">
            <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
              <div>
                <p class="eyebrow mb-1">STAGE {{ index + 1 }}</p>
                <h3 class="h5 mb-0">{{ stageName }}</h3>
              </div>
              <span class="stage-status" :class="{
                'stage-approved': booking.stageProgress[index].approved,
                'stage-pending': !booking.stageProgress[index].approved && booking.stageProgress[index].reflection,
              }">
                {{ stageStatus(booking.stageProgress[index]) }}
              </span>
            </div>

            <div v-if="isLearner && isActive && !booking.stageProgress[index].approved">
              <label class="form-label" :for="'reflection-' + index">
                What did you learn in this stage? <span class="required-marker" aria-hidden="true">*</span>
              </label>
              <textarea
                :id="'reflection-' + index"
                v-model="reflections[index]"
                class="form-control"
                :class="{ 'is-invalid': reflectionErrors[index] }"
                rows="4"
                maxlength="2000"
                placeholder="Share your takeaways, challenges, or a skill you practiced."
                required
                @input="reflectionErrors[index] = ''"
              ></textarea>
              <div v-if="reflectionErrors[index]" class="invalid-feedback d-block">
                {{ reflectionErrors[index] }}
              </div>
              <div class="d-flex justify-content-between align-items-center gap-2 mt-3">
                <small class="text-muted">{{ reflections[index]?.length || 0 }}/2000</small>
                <button
                  type="button"
                  class="btn btn-sm btn-brand"
                  :disabled="store.busyId === booking.id"
                  @click="submitReflection(index)"
                >
                  {{ store.busyId === booking.id ? 'Submitting...' : booking.stageProgress[index].reflection ? 'Update Reflection' : 'Submit for Approval' }}
                </button>
              </div>
            </div>

            <div v-else-if="booking.stageProgress[index].reflection" class="reflection">
              <p class="eyebrow mb-1">LEARNER REFLECTION</p>
              <p class="mb-3 reflection-text">{{ booking.stageProgress[index].reflection }}</p>
              <button
                v-if="!isLearner && isActive && !booking.stageProgress[index].approved"
                type="button"
                class="btn btn-sm btn-brand"
                :disabled="store.busyId === booking.id"
                @click="approveStage(index)"
              >
                {{ store.busyId === booking.id ? 'Approving...' : 'Approve Stage' }}
              </button>
              <p v-if="booking.stageProgress[index].approvedAt" class="small text-muted mb-0 mt-2">
                Approved {{ new Date(booking.stageProgress[index].approvedAt).toLocaleString() }}
              </p>
            </div>

            <p v-else-if="isActive" class="text-muted small mb-0">Waiting for the learner to submit a reflection.</p>
            <p v-else class="text-muted small mb-0">This booking is {{ booking.status }}. Stage progress is read-only.</p>
          </article>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.progress-page {
  max-width: 900px;
}

.stage-list {
  display: grid;
  gap: 12px;
}

.stage-status {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--k-surface-alt);
  color: var(--k-muted);
  font-size: 12px;
  font-weight: 600;
}

.stage-pending {
  background: #fff2cc;
  color: #765511;
}

.stage-approved {
  background: #dcebdf;
  color: #2f5d3d;
}

.reflection {
  border-top: 1px solid var(--k-border);
  padding-top: 14px;
}

.reflection-text {
  white-space: pre-wrap;
}

.required-marker {
  color: #dc3545;
  font-weight: 700;
}
</style>