<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { useBookingsStore } from '../stores/bookings'
import { useProfileStore } from '../stores/profile'
import { useOffersStore } from '../stores/offers'
import { useToastStore } from '../stores/toast'
import NavBar from '../components/NavBar.vue'
import LoadingText from '../components/LoadingText.vue'
import EmptyState from '../components/EmptyState.vue'
import ClassModal from '../components/ClassModal.vue'

const router = useRouter()
const store = useBookingsStore()
const profileStore = useProfileStore()
const offersStore = useOffersStore()
const toast = useToastStore()
const credits = computed(() => profileStore.credits)

// ---------- Load ----------
let timer = null
let unmounted = false // the page can be left while the loads below are still waiting
onMounted(async () => {
  await auth.authStateReady() // wait until Firebase has restored the login
  if (unmounted) return
  if (!auth.currentUser) {
    router.push('/login')
    return
  }
  await Promise.all([profileStore.fetchProfile(), store.fetchBookings()]) // credits, and my bookings
  if (unmounted) return
  await profileStore.fetchMyCourses() // the courses I host
  if (unmounted) return

  // keep the "new message" dots and the reflections fresh while the page stays open
  timer = setInterval(() => {
    if (!document.hidden) store.refreshBookings()
  }, 20 * 1000)
})

onUnmounted(() => {
  unmounted = true
  clearInterval(timer)
  narrowQuery.removeEventListener('change', onWidthChange)
})

// ---------- Folding the two lists on narrow screens ----------
// Below the lg breakpoint the two lists sit on top of each other, so each one is folded down
// to its class names until its heading is pressed. On wider screens both are always open.
const narrowQuery = window.matchMedia('(max-width: 991.98px)')
const isNarrow = ref(narrowQuery.matches)
function onWidthChange(e) {
  isNarrow.value = e.matches
}
narrowQuery.addEventListener('change', onWidthChange)

const expanded = ref({ attending: false, hosting: false })

function isOpen(section) {
  return !isNarrow.value || expanded.value[section]
}

function toggleSection(section) {
  expanded.value[section] = !expanded.value[section]
}

// ---------- Small helpers ----------
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

function findBooking(id) {
  return store.bookings.find((b) => b.id === id) || null
}

// The server works out each booking's "phase" (see server/models/bookingRules.js).
const phaseLabels = {
  upcoming: 'Upcoming',
  inProgress: 'In progress',
  readyToFinish: 'Ready to finish',
  finished: 'Finished',
  cancelled: 'Cancelled',
  disputed: 'Under review',
}

// What a stage looks like right now: approved, waiting for the teacher, or still to do
function stageState(stage) {
  if (stage.approved) return 'approved'
  if (stage.reflection) return 'waiting'
  return 'todo'
}

const stageLabels = {
  approved: 'Approved',
  waiting: 'Waiting for approval',
  todo: 'Ongoing',
}

// the stage the learner is working on now (the first one not approved yet), or -1 if all are done
function currentStageIndex(b) {
  const progress = b.stageProgress || []
  for (let i = 0; i < progress.length; i++) {
    if (!progress[i].approved) return i
  }
  return -1
}

function approvedCount(b) {
  return (b.stageProgress || []).filter((stage) => stage.approved).length
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
  if (b.removedByTeacher) {
    return b.role === 'learner' ? cost + ' refunded.' : 'You removed this student. They were refunded.'
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

// ---------- Classes I host ----------
function isActive(b) {
  return b.status === 'booked' || b.status === 'disputed'
}

// My students in one course, people still taking it first
function studentsOf(offerId) {
  const list = store.teaching.filter((b) => b.offerId === offerId)
  return [...list.filter(isActive), ...list.filter((b) => !isActive(b))]
}

function activeStudentCount(offerId) {
  return store.teaching.filter((b) => b.offerId === offerId && isActive(b)).length
}

// ---------- The red numbers ----------
// unread messages from the other person in one booking's chat
function unreadOf(b) {
  if (typeof b.unreadCount === 'number') return b.unreadCount
  return b.unreadChat ? 1 : 0 // a server from before unreadCount
}

// reflections a student sent that the teacher has not approved yet
function reflectionsWaiting(b) {
  if (b.status !== 'booked') return 0
  return (b.stageProgress || []).filter((stage) => stage.reflection && !stage.approved).length
}

// what one of my students is waiting on me for: reflections to approve and messages to read
function studentActionCount(b) {
  return reflectionsWaiting(b) + unreadOf(b)
}

// the same, added up for every student of one course I host
function courseActionCount(offerId) {
  let total = 0
  for (const b of store.teaching) {
    if (b.offerId === offerId) total += studentActionCount(b)
  }
  return total
}

// the totals next to the two headings (also seen when the lists are folded on a phone)
const learningAlertCount = computed(() => store.learning.reduce((total, b) => total + unreadOf(b), 0))
const teachingAlertCount = computed(() =>
  profileStore.myOffers.reduce((total, offer) => total + courseActionCount(offer.id), 0)
)

function upcomingSlots(offer) {
  return (offer.slots || []).filter((slot) => !slot.past)
}

// ---------- The popups ----------
// Popups open on top of each other, like a stack of cards. "‹" takes the top one off,
// "×" takes them all off. Each card is { type, bookingId or offerId }.
//   details     - a class I attend: description, stages, buttons
//   reflection  - write the reflection for my current stage
//   students    - the students in a class I host
//   student     - one student's progress (view and approve reflections)
//   kick        - why I am removing the student
//   confirmKick - "Are you sure?"
//   slot        - add a new start time to a class I host
const stack = ref([])
const top = computed(() => stack.value[stack.value.length - 1] || null)
const formError = ref('') // a problem with what was typed in the open popup

function open(card) {
  store.actionError = ''
  formError.value = ''
  stack.value = [...stack.value, card]
}

function back() {
  store.actionError = ''
  formError.value = ''
  stack.value = stack.value.slice(0, -1)
}

function closeAll() {
  stack.value = []
}

// the booking or course the top popup is about
const topBooking = computed(() => (top.value && top.value.bookingId ? findBooking(top.value.bookingId) : null))
const topOffer = computed(() => {
  if (!top.value || !top.value.offerId) return null
  return profileStore.myOffers.find((o) => o.id === top.value.offerId) || null
})

// ---------- Class details (a class I attend) ----------
async function openDetails(b) {
  extraStep.value = ''
  open({ type: 'details', bookingId: b.id })
  // the description lives on the course, so load the courses once if they are not here yet
  if (offersStore.offers.length === 0 && !offersStore.loading) {
    await offersStore.fetchOffers()
  }
}

const detailsDescription = computed(() => {
  if (!topBooking.value) return ''
  const offer = offersStore.offers.find((o) => o.id === topBooking.value.offerId)
  return offer ? offer.description || '' : ''
})

// the stages after the current one are hidden by the server until it is approved
function lockedStageCount(b) {
  return Math.max((b.totalStageCount || 0) - (b.stageNames || []).length, 0)
}

// cancelling and reporting ask for one more step first
const extraStep = ref('') // '', 'cancel' or 'report'
const reportReason = ref('')

function showExtraStep(step) {
  extraStep.value = step
  reportReason.value = ''
  store.actionError = ''
}

async function doCancel(b) {
  if (await store.cancel(b.id)) extraStep.value = ''
}

async function doReport(b) {
  if (await store.report(b.id, reportReason.value.trim())) extraStep.value = ''
}

async function doConfirm(b) {
  await store.confirm(b.id)
}

function openChat(b) {
  router.push('/chat/' + b.id)
}

// ---------- Reflection ----------
const reflectionText = ref('')

function openReflection(b) {
  const index = currentStageIndex(b)
  reflectionText.value = index >= 0 ? b.stageProgress[index].reflection || '' : ''
  open({ type: 'reflection', bookingId: b.id })
}

// the stage the reflection popup is about
const reflectionStage = computed(() => {
  if (!topBooking.value) return null
  const index = currentStageIndex(topBooking.value)
  return index >= 0 ? { index: index, ...topBooking.value.stageProgress[index] } : null
})

async function submitReflection() {
  const b = topBooking.value
  const text = reflectionText.value.trim()
  if (text === '') {
    formError.value = 'Write your reflection before submitting.'
    return
  }
  if (text.length > 2000) {
    formError.value = 'Keep your reflection to 2000 characters or fewer.'
    return
  }
  formError.value = ''
  const ok = await store.submitReflection(b.id, reflectionStage.value.index, text)
  if (ok) {
    toast.show('Reflection sent to ' + b.teacherName + '.')
    back()
  }
}

// ---------- A student's progress (a class I host) ----------
const openReflections = ref([]) // the stage numbers whose reflection is shown

function openStudent(b) {
  openReflections.value = []
  open({ type: 'student', bookingId: b.id })
}

function toggleReflection(index) {
  if (openReflections.value.includes(index)) {
    openReflections.value = openReflections.value.filter((i) => i !== index)
  } else {
    openReflections.value = [...openReflections.value, index]
  }
}

async function approve(b, index) {
  await store.approveStage(b.id, index)
}

// ---------- Removing a student ----------
const kickReason = ref('')

function openKick(b) {
  kickReason.value = ''
  open({ type: 'kick', bookingId: b.id })
}

function askToKick() {
  if (kickReason.value.trim() === '') {
    formError.value = 'Please give a reason. The student will see it.'
    return
  }
  open({ type: 'confirmKick', bookingId: top.value.bookingId })
}

async function doKick() {
  const ok = await store.remove(topBooking.value.id, kickReason.value.trim())
  if (ok) {
    // back to the list of students: take off "Are you sure?", the reason and the student
    stack.value = stack.value.slice(0, -3)
    profileStore.fetchMyCourses() // a seat is free again
  }
}

// ---------- New start time ----------
const newSlot = ref({ date: '', time: '' })
const savingSlot = ref(false)

// today in Singapore, as "2026-11-08", so the date picker cannot go back in time
function todayText() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

function openSlot(offer) {
  newSlot.value = { date: '', time: '' }
  open({ type: 'slot', offerId: offer.id })
}

async function addSlot() {
  if (newSlot.value.date === '' || newSlot.value.time === '') {
    formError.value = 'Pick a date and a time.'
    return
  }
  formError.value = ''
  savingSlot.value = true
  const problem = await profileStore.addCourseSlot(top.value.offerId, newSlot.value.date, newSlot.value.time)
  savingSlot.value = false
  if (problem !== '') {
    formError.value = problem
    return
  }
  toast.show('New start time added.')
  back()
}
</script>

<template>
  <NavBar />

  <div class="container py-4">
    <div class="p-4 mb-4 banner d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div>
        <h1 class="h4 mb-1">My Classes</h1>
        <p class="mb-0">The classes you attend and the classes you host. A class is finished when both of you confirm it.</p>
      </div>
      <div class="text-center">
        <div class="fs-2 fw-bold font-heading">{{ credits }}</div>
        <p class="mb-0">time credits</p>
        <small v-if="store.heldCredits > 0">+ {{ store.heldCredits }} held in open bookings</small>
      </div>
    </div>

    <p v-if="store.error" class="text-danger">{{ store.error }}</p>
    <LoadingText v-else-if="store.loading && store.bookings.length === 0" text="Loading your classes..." />
    <p v-if="profileStore.error" class="alert alert-danger" role="alert">{{ profileStore.error }}</p>

    <div class="row g-4">
      <!-- ========== Classes I Am Attending ========== -->
      <section class="col-12 col-lg-6" aria-labelledby="attending-title">
        <div class="k-card p-3 p-md-4 h-100" :class="{ folded: !isOpen('attending') }">
          <p class="eyebrow mb-1">LEARNING</p>
          <h2 id="attending-title" class="h5 mb-3">
            <button
              v-if="isNarrow"
              type="button"
              class="section-toggle"
              :aria-expanded="isOpen('attending')"
              @click="toggleSection('attending')"
            >
              <span>
                Classes I Am Attending
                <span v-if="learningAlertCount > 0" class="count-alert ms-1">
                  {{ learningAlertCount }}<span class="visually-hidden"> unread messages</span>
                </span>
              </span>
              <span class="chevron" aria-hidden="true">▾</span>
            </button>
            <template v-else>
              Classes I Am Attending
              <span v-if="learningAlertCount > 0" class="count-alert ms-1">
                {{ learningAlertCount }}<span class="visually-hidden"> unread messages</span>
              </span>
            </template>
          </h2>

          <div v-for="b in store.learning" :key="b.id" class="class-row">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div class="min-w-0">
                <h3 class="h6 mb-1">{{ b.title }}</h3>
                <p v-if="isOpen('attending')" class="small text-muted mb-1">Taught by {{ b.teacherName }} &middot; starts {{ formatTime(b.startsAt) }}</p>
              </div>
              <span v-if="isOpen('attending')" class="status flex-shrink-0" :class="'status-' + b.phase">{{ phaseLabels[b.phase] }}</span>
            </div>

            <template v-if="isOpen('attending')">
            <p v-if="b.removedByTeacher" class="small text-danger mb-2">
              {{ b.teacherName }} removed you from this class: {{ b.removalReason }}
            </p>
            <div v-else-if="b.totalStageCount > 0 && b.status === 'booked'" class="mb-2">
              <div
                class="progress stage-bar"
                role="progressbar"
                :aria-label="'Stages approved in ' + b.title"
                :aria-valuenow="approvedCount(b)"
                aria-valuemin="0"
                :aria-valuemax="b.totalStageCount"
              >
                <div class="progress-bar" :style="{ width: (approvedCount(b) / b.totalStageCount) * 100 + '%' }"></div>
              </div>
              <small class="text-muted">{{ approvedCount(b) }} of {{ b.totalStageCount }} stages approved</small>
            </div>

            <div class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary" @click="openDetails(b)">Details</button>
              <button
                v-if="b.status === 'booked' && currentStageIndex(b) >= 0"
                type="button"
                class="btn btn-sm btn-brand"
                @click="openReflection(b)"
              >
                Reflection
              </button>
              <button
                v-if="b.chatOpen || b.messageCount > 0"
                type="button"
                class="btn btn-sm btn-outline-dark position-relative"
                @click="openChat(b)"
              >
                Chat
                <span v-if="unreadOf(b) > 0" class="count-alert count-corner">
                  {{ unreadOf(b) }}<span class="visually-hidden"> unread messages</span>
                </span>
              </button>
            </div>
            </template>
          </div>

          <EmptyState
            v-if="store.learning.length === 0 && !store.loading && !store.error"
            icon="📚"
            title="You have not booked a class yet."
          >
            <button class="btn btn-sm btn-brand" @click="router.push('/courses')">Find a course</button>
          </EmptyState>
        </div>
      </section>

      <!-- ========== Classes I Am Hosting ========== -->
      <section class="col-12 col-lg-6" aria-labelledby="hosting-title">
        <div class="k-card p-3 p-md-4 h-100" :class="{ folded: !isOpen('hosting') }">
          <p class="eyebrow mb-1">TEACHING</p>
          <h2 id="hosting-title" class="h5 mb-3">
            <button
              v-if="isNarrow"
              type="button"
              class="section-toggle"
              :aria-expanded="isOpen('hosting')"
              @click="toggleSection('hosting')"
            >
              <span>
                Classes I Am Hosting
                <span v-if="teachingAlertCount > 0" class="count-alert ms-1">
                  {{ teachingAlertCount }}<span class="visually-hidden"> things waiting for you</span>
                </span>
              </span>
              <span class="chevron" aria-hidden="true">▾</span>
            </button>
            <template v-else>
              Classes I Am Hosting
              <span v-if="teachingAlertCount > 0" class="count-alert ms-1">
                {{ teachingAlertCount }}<span class="visually-hidden"> things waiting for you</span>
              </span>
            </template>
          </h2>

          <div v-for="offer in profileStore.myOffers" :key="offer.id" class="class-row">
            <h3 class="h6 mb-1">{{ offer.title }}</h3>
            <template v-if="isOpen('hosting')">
            <p class="small text-muted mb-2">
              {{ activeStudentCount(offer.id) }} student{{ activeStudentCount(offer.id) === 1 ? '' : 's' }}
              &middot;
              {{ upcomingSlots(offer).length }} upcoming start time{{ upcomingSlots(offer).length === 1 ? '' : 's' }}
            </p>
            <div class="d-flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary position-relative"
                @click="open({ type: 'students', offerId: offer.id })"
              >
                Students
                <span v-if="courseActionCount(offer.id) > 0" class="count-alert count-corner">
                  {{ courseActionCount(offer.id) }}<span class="visually-hidden"> reflections or messages waiting for you</span>
                </span>
              </button>
              <button type="button" class="btn btn-sm btn-brand" @click="openSlot(offer)">Add time slot</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" @click="router.push('/teach/' + offer.id)">Edit course</button>
            </div>
            </template>
          </div>

          <EmptyState
            v-if="profileStore.myOffers.length === 0 && profileStore.coursesLoaded"
            icon="🎓"
            title="You are not hosting a class yet."
          >
            <button class="btn btn-sm btn-brand" @click="router.push('/teach/new')">Offer a course</button>
          </EmptyState>
        </div>
      </section>
    </div>
  </div>

  <!-- ========== Popups (only the top one is shown) ========== -->

  <!-- Class details -->
  <ClassModal
    v-if="top && top.type === 'details' && topBooking"
    :title="topBooking.title"
    :subtitle="'Instructor: ' + topBooking.teacherName"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <p v-if="detailsDescription" class="mb-3">{{ detailsDescription }}</p>
    <p class="small mb-1">Starts {{ formatTime(topBooking.startsAt) }} &middot; {{ topBooking.sessionDurationMinutes }} minutes per session</p>
    <p class="small mb-1">{{ topBooking.mode === 'online' ? 'Online class' : 'Meets at ' + topBooking.place + ' (' + topBooking.region + ')' }}</p>
    <p v-if="topBooking.mode !== 'online' && topBooking.address" class="small text-muted mb-1">{{ topBooking.address }}</p>
    <p class="small mb-3">{{ creditNote(topBooking) }}</p>

    <template v-if="topBooking.totalStageCount > 0">
      <h3 class="h6">Stages</h3>
      <ol class="stage-list">
        <li v-for="(stage, index) in topBooking.stageProgress" :key="index" class="stage-item">
          <span>{{ stage.stageName }}</span>
          <span class="stage-pill" :class="'stage-' + stageState(stage)">{{ stageLabels[stageState(stage)] }}</span>
        </li>
        <li v-for="n in lockedStageCount(topBooking)" :key="'locked-' + n" class="stage-item stage-locked">
          <span>Stage {{ topBooking.stageNames.length + n }}</span>
          <span class="small">Opens after the stage before is approved</span>
        </li>
      </ol>
    </template>

    <!-- what happens next -->
    <p v-if="topBooking.phase === 'upcoming' && topBooking.canCancel" class="small text-muted mb-2">
      Free cancellation until {{ formatTime(topBooking.cancelBefore) }}.
    </p>
    <p v-else-if="topBooking.phase === 'inProgress'" class="small text-muted mb-2">
      You can mark it finished from {{ formatTime(topBooking.finishAfter) }}.
    </p>
    <p v-else-if="topBooking.phase === 'readyToFinish' && topBooking.myConfirmed" class="small text-muted mb-2">
      You confirmed. Waiting for {{ topBooking.teacherName }}.
    </p>
    <p v-else-if="topBooking.phase === 'disputed' && topBooking.reportedByMe" class="small text-muted mb-2">
      You reported: {{ topBooking.reportReason }}
    </p>
    <p v-if="topBooking.resolutionNote" class="small text-muted mb-2">Admin's note: {{ topBooking.resolutionNote }}</p>

    <div v-if="extraStep === 'cancel'" class="border rounded p-2 mt-2">
      <p class="small mb-2">Cancel this booking? {{ creditsText(topBooking.creditCost) }} will be refunded to you.</p>
      <button class="btn btn-sm btn-danger me-2" :disabled="store.busyId === topBooking.id" @click="doCancel(topBooking)">Yes, cancel</button>
      <button class="btn btn-sm btn-outline-secondary" @click="extraStep = ''">Keep it</button>
    </div>
    <div v-if="extraStep === 'report'" class="border rounded p-2 mt-2">
      <label for="report-reason" class="small mb-2">Tell us what went wrong. The credits stay held until it is sorted out.</label>
      <textarea id="report-reason" v-model="reportReason" class="form-control form-control-sm mb-2" rows="3" maxlength="300"></textarea>
      <button class="btn btn-sm btn-danger me-2" :disabled="store.busyId === topBooking.id || reportReason.trim() === ''" @click="doReport(topBooking)">
        Send report
      </button>
      <button class="btn btn-sm btn-outline-secondary" @click="extraStep = ''">Never mind</button>
    </div>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template v-if="topBooking.canCancel || topBooking.canReport || topBooking.canConfirm" #footer>
      <button v-if="topBooking.canCancel" type="button" class="btn btn-sm btn-outline-danger" @click="showExtraStep('cancel')">Cancel booking</button>
      <button v-if="topBooking.canReport" type="button" class="btn btn-sm btn-outline-secondary" @click="showExtraStep('report')">Report a problem</button>
      <button v-if="topBooking.canConfirm" type="button" class="btn btn-sm btn-brand" :disabled="store.busyId === topBooking.id" @click="doConfirm(topBooking)">
        Mark as finished
      </button>
    </template>
  </ClassModal>

  <!-- Reflection -->
  <ClassModal
    v-else-if="top && top.type === 'reflection' && topBooking"
    :title="reflectionStage ? reflectionStage.stageName : topBooking.title"
    :subtitle="reflectionStage ? 'Stage ' + (reflectionStage.index + 1) + ' of ' + topBooking.totalStageCount + ' · ' + topBooking.title : topBooking.title"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <template v-if="reflectionStage">
      <p v-if="reflectionStage.reflection" class="small text-muted">
        You sent this one already. {{ topBooking.teacherName }} hasn't approved it yet, so you can still change it.
      </p>
      <label for="reflection-text" class="form-label">Reflection</label>
      <textarea
        id="reflection-text"
        v-model="reflectionText"
        class="form-control"
        rows="6"
        maxlength="2000"
        placeholder="What did you learn in this stage? What was hard?"
      ></textarea>
      <small class="text-muted">{{ reflectionText.length }}/2000</small>
    </template>
    <p v-else class="mb-0">Every stage is approved. Well done!</p>
    <p v-if="formError" class="small text-danger mt-2 mb-0" role="alert">{{ formError }}</p>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="closeAll">Cancel</button>
      <button v-if="reflectionStage" type="button" class="btn btn-brand" :disabled="store.busyId === topBooking.id" @click="submitReflection">
        Submit
      </button>
    </template>
  </ClassModal>

  <!-- Students in a class I host -->
  <ClassModal
    v-else-if="top && top.type === 'students' && topOffer"
    title="Students enrolled"
    :subtitle="topOffer.title"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <button v-for="b in studentsOf(topOffer.id)" :key="b.id" type="button" class="student-row" @click="openStudent(b)">
      <span class="min-w-0">
        <strong class="d-block text-truncate">{{ b.learnerName }}</strong>
        <small class="text-muted">Starts {{ formatTime(b.startsAt) }} &middot; {{ phaseLabels[b.phase] }}</small>
      </span>
      <span
        v-if="studentActionCount(b) > 0"
        class="count-alert"
        :title="reflectionsWaiting(b) + ' reflection(s) to approve, ' + unreadOf(b) + ' unread message(s)'"
      >
        {{ studentActionCount(b) }}<span class="visually-hidden"> reflections or messages waiting for you</span>
      </span>
    </button>
    <EmptyState v-if="studentsOf(topOffer.id).length === 0" icon="🪑" title="Nobody has booked this class yet." />
  </ClassModal>

  <!-- One student's progress -->
  <ClassModal
    v-else-if="top && top.type === 'student' && topBooking"
    :title="topBooking.learnerName"
    :subtitle="topBooking.title + ' · ' + phaseLabels[topBooking.phase]"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <p class="small text-muted">{{ creditNote(topBooking) }}</p>
    <p v-if="topBooking.removedByTeacher" class="small mb-3">Your reason: {{ topBooking.removalReason }}</p>

    <template v-if="topBooking.totalStageCount > 0">
      <h3 class="h6">Progress</h3>
      <div v-for="(stage, index) in topBooking.stageProgress" :key="index" class="progress-row">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <span class="min-w-0 text-truncate">{{ index + 1 }}. {{ stage.stageName }}</span>
          <button
            v-if="stage.reflection"
            type="button"
            class="btn btn-sm btn-link p-0 flex-shrink-0"
            :aria-expanded="openReflections.includes(index) ? 'true' : 'false'"
            @click="toggleReflection(index)"
          >
            {{ openReflections.includes(index) ? 'Hide reflection' : 'View reflection' }}
            <span v-if="!stage.approved" class="review-badge ms-1">!</span>
          </button>
          <span v-else class="stage-pill stage-todo flex-shrink-0">Ongoing</span>
        </div>
        <div v-if="openReflections.includes(index)" class="reflection-box mt-2">
          <p class="mb-2">{{ stage.reflection }}</p>
          <span v-if="stage.approved" class="stage-pill stage-approved">Approved</span>
          <button
            v-else-if="topBooking.status === 'booked'"
            type="button"
            class="btn btn-sm btn-brand"
            :disabled="store.busyId === topBooking.id"
            @click="approve(topBooking, index)"
          >
            Approve this stage
          </button>
        </div>
      </div>
      <p v-if="topBooking.stageNames.length < topBooking.totalStageCount" class="small text-muted mt-2 mb-0">
        The next stage opens after you approve this one.
      </p>
    </template>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template v-if="topBooking.chatOpen || topBooking.messageCount > 0 || topBooking.canConfirm || topBooking.status === 'booked'" #footer>
      <button v-if="topBooking.chatOpen || topBooking.messageCount > 0" type="button" class="btn btn-sm btn-outline-dark position-relative" @click="openChat(topBooking)">
        Chat
        <span v-if="unreadOf(topBooking) > 0" class="count-alert count-corner">
          {{ unreadOf(topBooking) }}<span class="visually-hidden"> unread messages</span>
        </span>
      </button>
      <button v-if="topBooking.canConfirm" type="button" class="btn btn-sm btn-outline-secondary" :disabled="store.busyId === topBooking.id" @click="doConfirm(topBooking)">
        Mark as finished
      </button>
      <button v-if="topBooking.status === 'booked'" type="button" class="btn btn-sm btn-danger" @click="openKick(topBooking)">Kick</button>
    </template>
  </ClassModal>

  <!-- Why the student is being removed -->
  <ClassModal
    v-else-if="top && top.type === 'kick' && topBooking"
    :title="topBooking.learnerName"
    subtitle="Remove from this class"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <label for="kick-reason" class="form-label">Reason for dismissal</label>
    <textarea id="kick-reason" v-model="kickReason" class="form-control" rows="4" maxlength="300"></textarea>
    <small class="text-muted">{{ topBooking.learnerName }} will see this, and gets {{ creditsText(topBooking.creditCost) }} back.</small>
    <p v-if="formError" class="small text-danger mt-2 mb-0" role="alert">{{ formError }}</p>

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="back">Cancel</button>
      <button type="button" class="btn btn-danger" @click="askToKick">Kick</button>
    </template>
  </ClassModal>

  <!-- Are you sure? -->
  <ClassModal
    v-else-if="top && top.type === 'confirmKick' && topBooking"
    title="Are you sure?"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <p class="mb-0">
      {{ topBooking.learnerName }} will be removed from {{ topBooking.title }} and refunded. This can't be undone.
    </p>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template #footer>
      <button type="button" class="btn btn-danger" :disabled="store.busyId === topBooking.id" @click="doKick">Confirm</button>
      <button type="button" class="btn btn-outline-secondary" @click="back">Cancel</button>
    </template>
  </ClassModal>

  <!-- New start time -->
  <ClassModal
    v-else-if="top && top.type === 'slot' && topOffer"
    title="New time slot"
    :subtitle="topOffer.title"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <div class="row g-2">
      <div class="col-12 col-sm-6">
        <label for="slot-date" class="form-label">Date</label>
        <input id="slot-date" v-model="newSlot.date" type="date" class="form-control" :min="todayText()" />
      </div>
      <div class="col-12 col-sm-6">
        <label for="slot-time" class="form-label">Time</label>
        <input id="slot-time" v-model="newSlot.time" type="time" class="form-control" />
      </div>
    </div>
    <p v-if="formError" class="small text-danger mt-2 mb-0" role="alert">{{ formError }}</p>

    <template v-if="upcomingSlots(topOffer).length > 0">
      <h3 class="h6 mt-3">Already planned</h3>
      <ul class="small text-muted mb-0 ps-3">
        <li v-for="slot in upcomingSlots(topOffer)" :key="slot.id">
          {{ slot.date }} {{ slot.time }} &middot; {{ slot.taken }}/{{ slot.capacity }} booked
        </li>
      </ul>
    </template>

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="closeAll">Cancel</button>
      <button type="button" class="btn btn-brand" :disabled="savingSlot" @click="addSlot">
        {{ savingSlot ? 'Adding...' : 'Add time slot' }}
      </button>
    </template>
  </ClassModal>
</template>

<style scoped>
/* The colours, and the classes k-card, banner, status and eyebrow, come from src/assets/theme.css */
.class-row {
  padding: 14px 0;
  border-top: 1px solid var(--k-border);
}

.class-row:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.min-w-0 {
  min-width: 0;
}

/* the heading button that folds a list open and shut on narrow screens */
.section-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.chevron {
  transition: transform 0.2s ease;
}

.section-toggle[aria-expanded='true'] .chevron {
  transform: rotate(180deg);
}

/* a folded list only shows the class names, so the rows sit closer together */
.folded .class-row {
  padding: 8px 0;
}

.folded .class-row:first-of-type {
  padding-top: 0;
}

.stage-bar {
  height: 6px;
}

/* the red number: unread messages, or reflections waiting for the teacher */
.count-alert {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--k-danger);
  color: #fff;
  font-family: var(--k-font-body, inherit);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
}

/* the same number sitting on the corner of a button (Chat, Students) */
.count-corner {
  position: absolute;
  top: -9px;
  right: -9px;
  border: 2px solid var(--k-surface);
}

/* ---------- Inside the popups ---------- */
.stage-list {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}

.stage-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 6px;
  border: 1px solid var(--k-border);
  border-radius: 10px;
}

/* stages still hidden: striped, like the sketch */
.stage-locked {
  color: var(--k-muted);
  background: repeating-linear-gradient(
    45deg,
    var(--k-surface-alt),
    var(--k-surface-alt) 6px,
    var(--k-surface) 6px,
    var(--k-surface) 12px
  );
}

.stage-pill {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  white-space: nowrap;
}

.stage-approved {
  background: #dcebdf;
  color: #2f5d3d;
}

.stage-waiting {
  background: #fbe7a8;
  color: #6b5200;
}

.stage-todo {
  background: var(--k-surface-alt);
  color: var(--k-muted);
}

.student-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--k-border);
  border-radius: 10px;
  background: var(--k-surface);
  color: var(--k-text);
  text-align: left;
}

.student-row:hover {
  background: var(--k-surface-alt);
}

/* the "!" when a reflection is waiting for the teacher */
.review-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--k-danger);
  color: #fff;
  font-weight: 700;
  font-size: 0.8rem;
}

.progress-row {
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--k-border);
  border-radius: 10px;
}

.reflection-box {
  padding: 10px;
  border-radius: 8px;
  background: var(--k-surface-alt);
  white-space: pre-wrap;
}
</style>
