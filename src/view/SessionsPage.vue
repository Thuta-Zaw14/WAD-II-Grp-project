<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { useBookingsStore } from '../stores/bookings'
import { useProfileStore } from '../stores/profile'

const router = useRouter()
const store = useBookingsStore()
const profileStore = useProfileStore()
const credits = computed(() => profileStore.credits)

// ---------- Load ----------
let timer = null
onMounted(async () => {
  await auth.authStateReady() // wait until Firebase has restored the login
  if (!auth.currentUser) {
    router.push('/login')
    return
  }
  profileStore.fetchProfile() // for the credits number
  store.fetchBookings()

  // keep the "new message" dots fresh while the page stays open
  timer = setInterval(() => {
    if (!document.hidden) store.refreshBookings()
  }, 20 * 1000)
})

onUnmounted(() => {
  clearInterval(timer)
})

function goHome() {
  router.push('/home')
}

// the two lists on the page
const sections = computed(() => [
  {
    key: 'learning',
    title: 'Courses I am learning',
    list: store.learning,
    empty: 'You have not booked anything yet. Find a course on the home page.',
  },
  {
    key: 'teaching',
    title: 'Courses I teach',
    list: store.teaching,
    empty: 'Nobody has booked one of your courses yet.',
  },
])

// ---------- How a booking is shown ----------
// The server works out each booking's "phase" (see server/models/bookingRules.js).
const phaseLabels = {
  upcoming: 'Upcoming',
  inProgress: 'In progress',
  readyToFinish: 'Ready to finish',
  finished: 'Finished',
  cancelled: 'Cancelled',
  disputed: 'Under review',
}

const phaseColors = {
  upcoming: 'text-bg-info',
  inProgress: 'text-bg-primary',
  readyToFinish: 'text-bg-warning',
  finished: 'text-bg-success',
  cancelled: 'text-bg-secondary',
  disputed: 'text-bg-danger',
}

// "Sat, 8 Nov, 14:00" in Singapore time
function formatTime(iso) {
  return new Date(iso).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function creditsText(count) {
  return count + ' credit' + (count === 1 ? '' : 's')
}

// the person on the other side of this booking
function otherName(b) {
  return b.role === 'learner' ? b.teacherName : b.learnerName
}

// one line about what happens to the credits
function creditNote(b) {
  const cost = creditsText(b.creditCost)
  // a report that an admin has settled says how
  if (b.resolution === 'teacher-paid') {
    return b.role === 'learner' ? cost + ' paid to ' + b.teacherName + ' after an admin looked at your report.' : 'You earned ' + cost + ' after an admin looked at the report.'
  }
  if (b.resolution === 'student-refunded') {
    return b.role === 'learner' ? cost + ' refunded after an admin looked at your report.' : 'An admin refunded the student after a report. No credits.'
  }
  if (b.role === 'learner') {
    if (b.status === 'finished') return cost + ' paid to ' + b.teacherName + '.'
    if (b.status === 'cancelled') return cost + ' refunded.'
    return cost + ' held until the course is finished.'
  }
  if (b.status === 'finished') return 'You earned ' + cost + '.'
  if (b.status === 'cancelled') return 'Cancelled by the student. No credits.'
  if (b.status === 'disputed') return cost + ' on hold while the report is looked at.'
  return 'You earn ' + cost + ' when you both confirm it is finished.'
}

// ---------- Buttons ----------
// Cancelling and reporting ask for one more step first. panel says which booking is open and for what.
const panel = ref({ id: '', type: '' }) // type is 'cancel' or 'report'
const reason = ref('')

function openPanel(id, type) {
  panel.value = { id: id, type: type }
  reason.value = ''
  store.actionError = ''
}

function closePanel() {
  panel.value = { id: '', type: '' }
}

// ---------- Chat ----------
// The chat has its own page (see ChatPage.vue)
function openChat(b) {
  router.push('/chat/' + b.id)
}

async function doCancel(b) {
  const ok = await store.cancel(b.id)
  if (ok) closePanel()
}

async function doConfirm(b) {
  await store.confirm(b.id)
}

async function doReport(b) {
  const ok = await store.report(b.id, reason.value.trim())
  if (ok) closePanel()
}
</script>

<template>
  <nav class="navbar border-bottom px-3">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <span class="text-dark" role="button" @click="goHome">Back to home</span>
  </nav>

  <div class="container py-4">
    <div class="p-4 mb-4 rounded banner d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div>
        <h1 class="h4 mb-1">My sessions</h1>
        <p class="mb-0">Your bookings, as a student and as a teacher. A course is finished when both confirm it.</p>
      </div>
      <div class="text-center">
        <div class="fs-2 fw-bold">{{ credits }}</div>
        <p class="mb-0">time credits</p>
        <small v-if="store.heldCredits > 0">+ {{ store.heldCredits }} held in open bookings</small>
      </div>
    </div>

    <p v-if="store.error" class="text-danger">{{ store.error }}</p>
    <p v-else-if="store.loading && store.bookings.length === 0" class="text-muted">Loading your sessions...</p>
    <div v-if="store.actionError" class="alert alert-danger">{{ store.actionError }}</div>

    <!-- The same card is used for both lists below -->
    <template v-for="section in sections" :key="section.key">
      <h2 class="h5 mb-3">{{ section.title }}</h2>

      <div class="row g-3 mb-4">
        <div v-for="b in section.list" :key="b.id" class="col-12 col-sm-6 col-lg-4">
          <div class="card h-100">
            <div class="card-body d-flex flex-column">
              <div class="d-flex justify-content-between mb-2">
                <span class="badge text-bg-light">{{ b.category }}</span>
                <span class="badge" :class="phaseColors[b.phase]">{{ phaseLabels[b.phase] }}</span>
              </div>

              <h3 class="h5">{{ b.title }}</h3>
              <p class="text-muted mb-1">
                {{ b.role === 'learner' ? 'Taught by ' + b.teacherName : 'Student: ' + b.learnerName }}
              </p>
              <p class="small mb-1">Starts {{ formatTime(b.startsAt) }}</p>
              <p v-if="b.mode === 'online'" class="small text-muted mb-1">Online class</p>
              <p v-else class="small text-muted mb-1">Meets at {{ b.place }} ({{ b.region }})</p>
              <p class="small mb-2">{{ creditNote(b) }}</p>

              <!-- what happens next -->
              <p v-if="b.phase === 'upcoming' && b.role === 'learner' && b.canCancel" class="small text-muted mb-2">
                Free cancellation until {{ formatTime(b.cancelBefore) }}.
              </p>
              <p v-else-if="b.phase === 'upcoming' && b.role === 'learner'" class="small text-muted mb-2">
                This can no longer be cancelled (less than 24 hours to go).
              </p>
              <p v-else-if="b.phase === 'inProgress'" class="small text-muted mb-2">
                You can mark it finished from {{ formatTime(b.finishAfter) }}.
              </p>
              <p v-else-if="b.phase === 'readyToFinish' && b.myConfirmed" class="small text-muted mb-2">
                You confirmed. Waiting for {{ otherName(b) }}.
              </p>
              <p v-else-if="b.phase === 'readyToFinish' && b.otherConfirmed" class="small text-muted mb-2">
                {{ otherName(b) }} has confirmed. Your turn.
              </p>
              <p v-else-if="b.phase === 'disputed' && b.reportedByMe" class="small text-muted mb-2">
                You reported: {{ b.reportReason }}
              </p>
              <p v-else-if="b.phase === 'disputed'" class="small text-muted mb-2">
                A problem was reported. It is being looked at.
              </p>
              <p v-if="b.resolutionNote" class="small text-muted mb-2">Admin's note: {{ b.resolutionNote }}</p>

              <!-- buttons -->
              <div class="mt-auto">
                <div class="d-flex flex-wrap gap-2">
                  <button
                    v-if="b.canConfirm"
                    class="btn btn-sm btn-brand"
                    :disabled="store.busyId === b.id"
                    @click="doConfirm(b)"
                  >
                    Mark as finished
                  </button>
                  <button
                    v-if="b.canCancel"
                    class="btn btn-sm btn-outline-danger"
                    @click="openPanel(b.id, 'cancel')"
                  >
                    Cancel booking
                  </button>
                  <button
                    v-if="b.canReport"
                    class="btn btn-sm btn-outline-secondary"
                    @click="openPanel(b.id, 'report')"
                  >
                    Report a problem
                  </button>
                  <button
                    v-if="b.chatOpen || b.messageCount > 0"
                    class="btn btn-sm btn-outline-dark position-relative"
                    @click="openChat(b)"
                  >
                    Chat with {{ otherName(b) }}
                    <span
                      v-if="b.unreadChat"
                      class="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle"
                    >
                      <span class="visually-hidden">New messages</span>
                    </span>
                  </button>
                </div>

                <!-- the extra step for Cancel -->
                <div v-if="panel.id === b.id && panel.type === 'cancel'" class="border rounded p-2 mt-2">
                  <p class="small mb-2">
                    Cancel this booking? {{ creditsText(b.creditCost) }} will be refunded to you.
                  </p>
                  <button class="btn btn-sm btn-danger me-2" :disabled="store.busyId === b.id" @click="doCancel(b)">
                    Yes, cancel
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" @click="closePanel">Keep it</button>
                </div>

                <!-- the extra step for Report -->
                <div v-if="panel.id === b.id && panel.type === 'report'" class="border rounded p-2 mt-2">
                  <p class="small mb-2">
                    Tell us what went wrong. The credits stay held until the problem is sorted out.
                  </p>
                  <textarea
                    v-model="reason"
                    class="form-control form-control-sm mb-2"
                    rows="3"
                    maxlength="300"
                    placeholder="What happened?"
                  ></textarea>
                  <button
                    class="btn btn-sm btn-danger me-2"
                    :disabled="store.busyId === b.id || reason.trim() === ''"
                    @click="doReport(b)"
                  >
                    Send report
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" @click="closePanel">Never mind</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="section.list.length === 0 && !store.loading && !store.error" class="text-muted mb-4">
        {{ section.empty }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.banner {
  background: #f5f0e1;
  color: #4a3f2a;
}

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
