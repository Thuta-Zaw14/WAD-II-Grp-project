<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { useBookingsStore } from '../stores/bookings'
import { useProfileStore } from '../stores/profile'
import { useOffersStore } from '../stores/offers'
import { useToastStore } from '../stores/toast'
import NavBar from '../components/NavBar.vue'
import CancelNotices from '../components/CancelNotices.vue'
import { unreadOf, reflectionsWaiting, reflectionsRejected, studentActionCount } from '../services/attention'
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
  readyToFinish: 'Lesson done',
  finished: 'Finished',
  cancelled: 'Cancelled',
  disputed: 'Under review',
}

// What a stage's reflection looks like right now: accepted, sent back to be rewritten, waiting for
// the teacher, or not written yet
function stageState(stage) {
  if (stage.approved) return 'approved'
  if (stage.rejected) return 'rejected'
  if (stage.reflection) return 'waiting'
  return 'todo'
}

const stageLabels = {
  approved: 'Accepted',
  rejected: 'Needs rewriting',
  waiting: 'Waiting for review',
  todo: 'To write',
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
    if (b.role === 'learner') return cost + ' refunded.'
    return b.startTimeCancelled ? 'You cancelled this start time. The student was refunded.' : 'You removed this student. They were refunded.'
  }
  if (b.role === 'learner') {
    if (b.status === 'finished') return cost + ' paid to ' + b.teacherName + '.'
    if (b.status === 'cancelled' && b.refunded === false) {
      return 'Cancelled less than 24 hours before the start, so the ' + cost + ' went to ' + b.teacherName + '.'
    }
    if (b.status === 'cancelled') return cost + ' refunded.'
    return cost + ' held until the course is finished.'
  }
  if (b.status === 'finished') return 'You earned ' + cost + '.'
  if (b.status === 'cancelled' && b.refunded === false) {
    if (b.learnerDropped) return 'The student dropped after free cancellation ended, so you got the ' + cost + '.'
    return 'The student cancelled less than 24 hours before the start, so you got the ' + cost + '.'
  }
  if (b.status === 'cancelled') return 'Cancelled by the student. No credits.'
  if (b.status === 'disputed') return cost + ' on hold while the report is looked at.'
  return 'You earn ' + cost + ' when you have accepted every reflection.'
}

// "Classes I Am Attending": everything except dropped and cancelled classes. A class whose start
// time the teacher cancelled stays until I pick a new time or drop it (awaitingNewTime).
const attendingList = computed(() =>
  store.learning.filter((b) => b.status !== 'cancelled' || b.awaitingNewTime)
)

// ---------- Classes I host ----------
function isActive(b) {
  return b.status === 'booked' || b.status === 'disputed'
}

// My students in one course, people still taking it first
// The Students popup of a class I host: the students taking it now, and the past students who
// finished it (for them only the chat is offered). Students no longer in the class are not listed.
function studentsOf(offerId) {
  return store.teaching.filter((b) => b.offerId === offerId && isActive(b))
}

function pastStudentsOf(offerId) {
  return store.teaching
    .filter((b) => b.offerId === offerId && b.status === 'finished')
    .sort((a, b) => ((a.finishedAt || '') < (b.finishedAt || '') ? 1 : -1)) // most recent first
}

function activeStudentCount(offerId) {
  return store.teaching.filter((b) => b.offerId === offerId && isActive(b)).length
}

// ---------- The red numbers ----------
// What counts is in services/attention.js, so this page and "My Classes" in the nav bar agree.

// added up for every student of one course I host (reflections, messages, new students)
function courseActionCount(offerId) {
  let total = 0
  for (const b of store.teaching) {
    if (b.offerId === offerId) total += studentActionCount(b)
  }
  return total
}

// the totals next to the two headings (also seen when the lists are folded on a phone);
// the hosting one also counts cancellation notices until the teacher presses "Got it"
const learningAlertCount = computed(() => store.learningAlertCount)
const teachingAlertCount = computed(() => store.teachingAlertCount)

// The students of the course whose list is open who were new when it was opened: they keep a
// "New" tag while the list is open, even though opening it marks them seen straight away.
const newStudentIds = ref([])

function openStudents(offer) {
  newStudentIds.value = store.teaching.filter((b) => b.offerId === offer.id && b.newStudent).map((b) => b.id)
  open({ type: 'students', offerId: offer.id })
  store.markStudentsSeen(offer.id)
}

function upcomingSlots(offer) {
  return (offer.slots || []).filter((slot) => !slot.past)
}

// ---------- The popups ----------
// Popups open on top of each other, like a stack of cards. "‹" takes the top one off,
// "×" takes them all off. Each card is { type, bookingId or offerId }.
//   details     - a class I attend: description, stages, buttons
//   cancel      - "Cancel this class?" (a class I attend)
//   move        - move a class I attend to another start time of the same course
//   rebook      - the teacher cancelled my start time: pick another one
//   drop        - ...or drop the course (I was already refunded)
//   reflection  - write the reflection for my current stage
//   students    - the students in a class I host
//   student     - one student's progress (view and approve reflections)
//   kick        - why I am removing the student
//   confirmKick - "Are you sure?"
//   slot        - the start times of a class I host: move or cancel one, or add a new one
//   moveSlot    - move one start time (everyone booked at it moves too)
//   cancelSlot  - cancel one start time (everyone booked at it is refunded)
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
// How many stages the teacher approved since the student last opened these Details. Kept while
// the popup is open (to tag them "New"), even though opening it marks them seen straight away.
const newlyApprovedCount = ref(0)

// the latest newly approved stages get the "New" tag (stages are approved in order)
function isNewlyApproved(b, index) {
  const approved = []
  ;(b.stageProgress || []).forEach((stage, i) => {
    if (stage.approved) approved.push(i)
  })
  return approved.slice(approved.length - newlyApprovedCount.value).includes(index)
}

async function openDetails(b) {
  extraStep.value = ''
  newlyApprovedCount.value = b.newApprovals || 0
  open({ type: 'details', bookingId: b.id })
  if (newlyApprovedCount.value > 0) store.markApprovalsSeen(b.id)
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

// reporting asks for one more step first, inside the details popup
const extraStep = ref('') // '' or 'report'
const reportReason = ref('')

function showExtraStep(step) {
  extraStep.value = step
  reportReason.value = ''
  store.actionError = ''
}

// Cancelling a class I attend has its own "Are you sure?" popup. The credits always come back;
// the server says until when that is allowed (cancelBefore, see models/bookings.js).
function openCancel(b) {
  open({ type: 'cancel', bookingId: b.id })
}

async function doCancel(b) {
  if (await store.cancel(b.id)) closeAll()
}

async function doReport(b) {
  if (await store.report(b.id, reportReason.value.trim())) extraStep.value = ''
}

// ---------- Moving a class I attend to another start time ----------
// The choices: the course's other start times with a free seat, more than 24 hours away (the
// server checks all of this again, with its own clock).
const DAY_MS = 24 * 60 * 60 * 1000
const moveSlotId = ref('')

async function openMove(b) {
  moveSlotId.value = ''
  open({ type: 'move', bookingId: b.id })
  await offersStore.fetchOffers() // fresh seat counts
}

const moveChoices = computed(() => {
  const b = topBooking.value
  if (!b) return []
  const offer = offersStore.offers.find((o) => o.id === b.offerId)
  if (!offer) return []
  const earliest = Date.now() + DAY_MS
  return (offer.slots || []).filter(
    (slot) => slot.id !== b.slotId && slot.spotsLeft > 0 && slot.startsAt && new Date(slot.startsAt).getTime() > earliest
  )
})

// moving within the last 24 hours before the start means it can't be cancelled afterwards
const moveIsLate = computed(() => {
  const b = topBooking.value
  return b !== null && !b.movedLate && new Date(b.startsAt).getTime() - Date.now() < DAY_MS
})

async function doMove() {
  if (moveSlotId.value === '') {
    formError.value = 'Pick a new start time.'
    return
  }
  formError.value = ''
  if (await store.move(topBooking.value.id, moveSlotId.value)) closeAll()
}

// ---------- The teacher cancelled my start time ----------
// I got my credits back. Until I decide (awaitingNewTime, from the server), I can pick another start
// time of the course (it costs the credits again, on the same booking, so the chat stays), ask the
// teacher in the chat for another time, or drop the course.
async function openRebook(b) {
  moveSlotId.value = ''
  open({ type: 'rebook', bookingId: b.id })
  await offersStore.fetchOffers() // fresh seat counts
}

const rebookChoices = computed(() => {
  const b = topBooking.value
  if (!b) return []
  const offer = offersStore.offers.find((o) => o.id === b.offerId)
  if (!offer) return []
  return (offer.slots || []).filter(
    (slot) => slot.spotsLeft > 0 && !slot.past && slot.startsAt && new Date(slot.startsAt).getTime() > Date.now()
  )
})

async function doRebook() {
  if (moveSlotId.value === '') {
    formError.value = 'Pick a new start time.'
    return
  }
  formError.value = ''
  if (await store.rebook(topBooking.value.id, moveSlotId.value)) closeAll()
}

function openDrop(b) {
  open({ type: 'drop', bookingId: b.id })
}

async function doDrop(b) {
  if (await store.drop(b.id)) closeAll()
}

async function doConfirm(b) {
  await store.confirm(b.id)
}

function openChat(b) {
  router.push('/chat/' + b.id)
}

// ---------- Reflections (a class I attend) ----------
// A course is one lesson, so once it has started I write the reflections of ALL the stages and send
// them together. Accepted ones are locked; ones the teacher sent back must be rewritten.
const reflectionTexts = ref([])

function openReflection(b) {
  reflectionTexts.value = (b.stageProgress || []).map((stage) => stage.reflection || '')
  open({ type: 'reflection', bookingId: b.id })
}

async function submitReflection() {
  const b = topBooking.value
  const texts = reflectionTexts.value.map((text) => text.trim())
  for (let i = 0; i < b.stageProgress.length; i++) {
    const stage = b.stageProgress[i]
    if (stage.approved) continue
    if (texts[i] === '') {
      formError.value = 'Write a reflection for stage ' + (i + 1) + ' (' + stage.stageName + ').'
      return
    }
    if (texts[i].length > 2000) {
      formError.value = 'Keep the reflection for stage ' + (i + 1) + ' to 2000 characters or fewer.'
      return
    }
    if (stage.rejected && texts[i] === stage.reflection) {
      formError.value = 'Rewrite stage ' + (i + 1) + ' (' + stage.stageName + ') before sending: ' + b.teacherName + ' sent it back.'
      return
    }
  }
  formError.value = ''
  const ok = await store.sendReflections(b.id, texts)
  if (ok) {
    toast.show('Reflections sent to ' + b.teacherName + '.')
    back()
  }
}

// ---------- A student's progress (a class I host) ----------
const openReflections = ref([]) // the stage numbers whose reflection is shown

function openStudent(b) {
  openReflections.value = []
  rejectingIndex.value = -1
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

// sending a reflection back: a small box for an optional note opens under it first
const rejectingIndex = ref(-1)
const rejectNote = ref('')

function startReject(index) {
  rejectingIndex.value = index
  rejectNote.value = ''
}

async function reject(b, index) {
  if (await store.rejectStage(b.id, index, rejectNote.value.trim())) rejectingIndex.value = -1
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
  newSlot.value = { date: '', time: '' }
}

// ---------- Moving or cancelling one start time of a class I host ----------
// A start time can hold several students, so these act on all of them. With nobody booked the
// time is simply changed or removed. With students the server's rules apply (models/bookings.js):
// a move until 2 hours before, to a time more than 24 hours away, at most twice; a cancel needs
// a reason and refunds everyone.
const slotForm = ref({ date: '', time: '', text: '' }) // text = the note (move) or the reason (cancel)

// the start time the top popup is about
const topSlot = computed(() => {
  if (!topOffer.value || !top.value.slotId) return null
  return (topOffer.value.slots || []).find((slot) => slot.id === top.value.slotId) || null
})

function slotLabel(slot) {
  return slot.startsAt ? formatTime(slot.startsAt) : slot.date + ' ' + slot.time
}

function studentsText(count) {
  return count + ' student' + (count === 1 ? '' : 's')
}

// why a start time with students can't be moved any more ('' if it can)
function slotMoveProblem(slot) {
  if (!slot || slot.taken === 0) return ''
  if (slot.movesLeft === 0) return 'This start time has already been moved 2 times, so it can\'t be moved again. You can still cancel it.'
  if (slot.moveBefore && Date.now() >= new Date(slot.moveBefore).getTime()) {
    return 'It starts in less than 2 hours, so it can no longer be moved. You can still cancel it.'
  }
  return ''
}

function openMoveSlot(offer, slot) {
  slotForm.value = { date: '', time: '', text: '' }
  open({ type: 'moveSlot', offerId: offer.id, slotId: slot.id })
}

function openCancelSlot(offer, slot) {
  slotForm.value = { date: '', time: '', text: '' }
  open({ type: 'cancelSlot', offerId: offer.id, slotId: slot.id })
}

async function doMoveSlot() {
  const slot = topSlot.value
  if (slotForm.value.date === '' || slotForm.value.time === '') {
    formError.value = 'Pick the new date and time.'
    return
  }
  formError.value = ''
  savingSlot.value = true
  const students = slot.taken
  const problem = await profileStore.moveCourseSlot(
    top.value.offerId, slot.id, slotForm.value.date, slotForm.value.time, slotForm.value.text.trim()
  )
  savingSlot.value = false
  if (problem !== '') {
    formError.value = problem
    return
  }
  toast.show(students > 0 ? 'Start time moved. ' + studentsText(students) + ' will see a notice.' : 'Start time moved.')
  store.fetchBookings() // my students' bookings have the new time
  back()
}

async function doCancelSlot() {
  const slot = topSlot.value
  if (slot.taken > 0 && slotForm.value.text.trim() === '') {
    formError.value = 'Please give a reason. Your students will see it.'
    return
  }
  formError.value = ''
  savingSlot.value = true
  const students = slot.taken
  const problem = await profileStore.cancelCourseSlot(top.value.offerId, slot.id, slotForm.value.text.trim())
  savingSlot.value = false
  if (problem !== '') {
    formError.value = problem
    return
  }
  toast.show(students > 0 ? 'Start time cancelled. ' + studentsText(students) + ' refunded.' : 'Start time removed.')
  store.fetchBookings()
  back()
}
</script>

<template>
  <NavBar />

  <div class="container py-4">
    <div class="p-4 mb-4 banner d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div>
        <h1 class="h4 mb-1">My Classes</h1>
        <p class="mb-0">The classes you attend and the classes you host. A class is finished when the instructor accepts all its reflections.</p>
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

    <!-- classes that were cancelled or moved (by a student, or by the teacher) -->
    <CancelNotices />

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
                  {{ learningAlertCount }}<span class="visually-hidden"> things waiting for you</span>
                </span>
              </span>
              <span class="chevron" aria-hidden="true">▾</span>
            </button>
            <template v-else>
              Classes I Am Attending
              <span v-if="learningAlertCount > 0" class="count-alert ms-1">
                {{ learningAlertCount }}<span class="visually-hidden"> things waiting for you</span>
              </span>
            </template>
          </h2>

          <div v-for="b in attendingList" :key="b.id" class="class-row">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div class="min-w-0">
                <h3 class="h6 mb-1" :class="{ 'cancelled-title': b.status === 'cancelled' }">{{ b.title }}</h3>
                <p v-if="isOpen('attending')" class="small text-muted mb-1">Taught by {{ b.teacherName }} &middot; starts {{ formatTime(b.startsAt) }}</p>
              </div>
              <span v-if="isOpen('attending')" class="status flex-shrink-0" :class="'status-' + (b.awaitingNewTime ? 'upcoming' : b.phase)">{{ b.awaitingNewTime ? 'Needs a new time' : phaseLabels[b.phase] }}</span>
            </div>

            <template v-if="isOpen('attending')">
            <div v-if="b.awaitingNewTime" class="new-time-box mb-2" role="note">
              <p class="fw-semibold mb-1">{{ b.teacherName }} cancelled your start time</p>
              <p v-if="b.removalReason" class="small mb-1">Reason: {{ b.removalReason }}</p>
              <p class="small mb-2">
                Your {{ creditsText(b.creditCost) }} {{ b.creditCost === 1 ? 'was' : 'were' }} refunded. You can pick another time,
                ask {{ b.teacherName }} in the chat for one, or drop the course at no cost.
              </p>
              <div class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-brand" @click="openRebook(b)">Pick a new time</button>
                <button type="button" class="btn btn-sm btn-outline-dark" @click="openChat(b)">Chat with {{ b.teacherName }}</button>
                <button type="button" class="btn btn-sm btn-outline-danger" @click="openDrop(b)">Drop course</button>
              </div>
            </div>
            <p v-else-if="b.removedByTeacher && b.startTimeCancelled" class="small text-danger mb-2">
              {{ b.teacherName }} cancelled this start time: {{ b.removalReason }}
              <template v-if="b.learnerDropped"><br />You dropped the course. Your credits were refunded.</template>
            </p>
            <p v-else-if="b.removedByTeacher" class="small text-danger mb-2">
              {{ b.teacherName }} removed you from this class: {{ b.removalReason }}
            </p>
            <div v-else-if="b.totalStageCount > 0 && b.status === 'booked'" class="mb-2">
              <div
                class="progress stage-bar"
                role="progressbar"
                :aria-label="'Reflections accepted in ' + b.title"
                :aria-valuenow="approvedCount(b)"
                aria-valuemin="0"
                :aria-valuemax="b.totalStageCount"
              >
                <div class="progress-bar" :style="{ width: (approvedCount(b) / b.totalStageCount) * 100 + '%' }"></div>
              </div>
              <small class="text-muted">{{ approvedCount(b) }} of {{ b.totalStageCount }} reflections accepted</small>
            </div>

            <div class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary position-relative" @click="openDetails(b)">
                Details
                <span v-if="b.newApprovals > 0" class="count-alert count-corner">
                  {{ b.newApprovals }}<span class="visually-hidden"> stages newly approved</span>
                </span>
              </button>
              <button
                v-if="b.canReflect"
                type="button"
                class="btn btn-sm btn-brand position-relative"
                @click="openReflection(b)"
              >
                Reflections
                <span v-if="reflectionsRejected(b) > 0" class="count-alert count-corner">
                  {{ reflectionsRejected(b) }}<span class="visually-hidden"> reflections to rewrite</span>
                </span>
              </button>
              <button
                v-if="(b.chatOpen || b.messageCount > 0) && !b.awaitingNewTime"
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
            v-if="attendingList.length === 0 && !store.loading && !store.error"
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
                @click="openStudents(offer)"
              >
                Students
                <span v-if="courseActionCount(offer.id) > 0" class="count-alert count-corner">
                  {{ courseActionCount(offer.id) }}<span class="visually-hidden"> things waiting for you: reflections, messages or new students</span>
                </span>
              </button>
              <button type="button" class="btn btn-sm btn-brand" @click="openSlot(offer)">Start times</button>
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
    <p class="small mb-1">Starts {{ formatTime(topBooking.startsAt) }} &middot; one {{ topBooking.sessionDurationMinutes }}-minute lesson</p>
    <p class="small mb-1">{{ topBooking.mode === 'online' ? 'Online class' : 'Meets at ' + topBooking.place + ' (' + topBooking.region + ')' }}</p>
    <p v-if="topBooking.mode !== 'online' && topBooking.address" class="small text-muted mb-1">{{ topBooking.address }}</p>
    <p class="small mb-3">{{ creditNote(topBooking) }}</p>

    <template v-if="topBooking.totalStageCount > 0">
      <h3 class="h6">Stages</h3>
      <ol class="stage-list">
        <li v-for="(stage, index) in topBooking.stageProgress" :key="index" class="stage-item">
          <span>
            {{ stage.stageName }}
            <span v-if="isNewlyApproved(topBooking, index)" class="new-tag">New</span>
          </span>
          <span class="stage-pill" :class="'stage-' + stageState(stage)">{{ stageLabels[stageState(stage)] }}</span>
        </li>
        <li v-for="n in lockedStageCount(topBooking)" :key="'locked-' + n" class="stage-item stage-locked">
          <span>Stage {{ topBooking.stageNames.length + n }}</span>
          <span class="small">Opens after the stage before is approved</span>
        </li>
      </ol>
    </template>

    <!-- what happens next -->
    <template v-if="topBooking.phase === 'upcoming'">
      <p v-if="topBooking.canCancel && topBooking.teacherMoved" class="small text-muted mb-2">
        {{ topBooking.teacherName }} moved this class. If the new time doesn't suit you, you can cancel for a full refund until it starts.
      </p>
      <p v-else-if="topBooking.canCancel" class="small text-muted mb-2">
        Free cancellation until {{ formatTime(topBooking.cancelBefore) }}.
      </p>
      <p v-else-if="topBooking.movedLate" class="small text-muted mb-2">
        You moved this class less than 24 hours before it started, so it can no longer be cancelled.
        You can still drop it, but your {{ creditsText(topBooking.creditCost) }} will go to {{ topBooking.teacherName }}.
      </p>
      <p v-else class="small text-muted mb-2">
        Free cancellation has ended. You can still drop the course, but your {{ creditsText(topBooking.creditCost) }}
        will go to {{ topBooking.teacherName }}.
      </p>
      <p v-if="topBooking.canMove" class="small text-muted mb-2">
        You can move it to another start time until {{ formatTime(topBooking.moveBefore) }}
        ({{ topBooking.movesLeft }} move{{ topBooking.movesLeft === 1 ? '' : 's' }} left).
      </p>
    </template>
    <p v-else-if="topBooking.phase === 'inProgress'" class="small text-muted mb-2">
      <template v-if="reflectionsRejected(topBooking) > 0">
        {{ topBooking.teacherName }} sent back {{ reflectionsRejected(topBooking) }} reflection{{ reflectionsRejected(topBooking) === 1 ? '' : 's' }}. Rewrite {{ reflectionsRejected(topBooking) === 1 ? 'it' : 'them' }} under Reflections.
      </template>
      <template v-else>Write your reflections under Reflections. The course finishes when {{ topBooking.teacherName }} accepts them all.</template>
    </p>
    <p v-else-if="topBooking.phase === 'readyToFinish' && topBooking.myConfirmed" class="small text-muted mb-2">
      You confirmed. Waiting for {{ topBooking.teacherName }}.
    </p>
    <p v-else-if="topBooking.phase === 'disputed' && topBooking.reportedByMe" class="small text-muted mb-2">
      You reported: {{ topBooking.reportReason }}
    </p>
    <p v-if="topBooking.resolutionNote" class="small text-muted mb-2">Admin's note: {{ topBooking.resolutionNote }}</p>

    <div v-if="extraStep === 'report'" class="border rounded p-2 mt-2">
      <label for="report-reason" class="small mb-2">Tell us what went wrong. The credits stay held until it is sorted out.</label>
      <textarea id="report-reason" v-model="reportReason" class="form-control form-control-sm mb-2" rows="3" maxlength="300"></textarea>
      <button class="btn btn-sm btn-danger me-2" :disabled="store.busyId === topBooking.id || reportReason.trim() === ''" @click="doReport(topBooking)">
        Send report
      </button>
      <button class="btn btn-sm btn-outline-secondary" @click="extraStep = ''">Never mind</button>
    </div>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template v-if="topBooking.canCancel || topBooking.canMove || topBooking.canReport || topBooking.canConfirm || (topBooking.canDrop && !topBooking.awaitingNewTime)" #footer>
      <button v-if="topBooking.canMove" type="button" class="btn btn-sm btn-outline-secondary" @click="openMove(topBooking)">Move to another time</button>
      <button v-if="topBooking.canCancel" type="button" class="btn btn-sm btn-outline-danger" @click="openCancel(topBooking)">Cancel booking</button>
      <button v-if="topBooking.canDrop && !topBooking.awaitingNewTime" type="button" class="btn btn-sm btn-outline-danger" @click="openDrop(topBooking)">Drop course</button>
      <button v-if="topBooking.canReport" type="button" class="btn btn-sm btn-outline-secondary" @click="showExtraStep('report')">Report a problem</button>
      <button v-if="topBooking.canConfirm" type="button" class="btn btn-sm btn-brand" :disabled="store.busyId === topBooking.id" @click="doConfirm(topBooking)">
        Mark as finished
      </button>
    </template>
  </ClassModal>

  <!-- Cancel a class I attend: are you sure? -->
  <ClassModal
    v-else-if="top && top.type === 'cancel' && topBooking"
    title="Cancel this class?"
    :subtitle="topBooking.title + ' · starts ' + formatTime(topBooking.startsAt)"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <p class="mb-2">
      You'll get your <strong>{{ creditsText(topBooking.creditCost) }}</strong> back, and your seat goes to someone else.
    </p>
    <p class="small text-muted mb-0">Free cancellation is open until {{ formatTime(topBooking.cancelBefore) }}.</p>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template #footer>
      <button type="button" class="btn btn-sm btn-outline-secondary" @click="stack.length > 1 ? back() : closeAll()">Keep my booking</button>
      <button type="button" class="btn btn-sm btn-danger" :disabled="store.busyId === topBooking.id" @click="doCancel(topBooking)">
        {{ store.busyId === topBooking.id ? 'Cancelling...' : 'Yes, cancel' }}
      </button>
    </template>
  </ClassModal>

  <!-- Move a class I attend to another start time -->
  <ClassModal
    v-else-if="top && top.type === 'move' && topBooking"
    title="Move to another time"
    :subtitle="topBooking.title + ' · now ' + formatTime(topBooking.startsAt)"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <p class="small text-muted">
      Pick another start time of this course. It needs a free seat and must be more than 24 hours away.
      You can move this class {{ topBooking.movesLeft }} more time{{ topBooking.movesLeft === 1 ? '' : 's' }}.
      Your credits, chat and reflections stay with it.
    </p>
    <LoadingText v-if="offersStore.loading && moveChoices.length === 0" text="Loading start times..." />
    <fieldset v-else-if="moveChoices.length > 0" class="mb-0">
      <legend class="visually-hidden">New start time</legend>
      <label v-for="slot in moveChoices" :key="slot.id" class="move-choice">
        <input v-model="moveSlotId" type="radio" name="move-slot" :value="slot.id" class="form-check-input mt-0" />
        <span>{{ formatTime(slot.startsAt) }}</span>
        <small class="text-muted ms-auto">{{ slot.spotsLeft }} seat{{ slot.spotsLeft === 1 ? '' : 's' }} left</small>
      </label>
    </fieldset>
    <p v-else class="mb-0">
      There is no other start time with a free seat more than 24 hours away.
      Ask {{ topBooking.teacherName }} in the chat to add one.
    </p>
    <p v-if="moveIsLate && moveChoices.length > 0" class="alert alert-warning small mt-3 mb-0" role="note">
      Your class starts in less than 24 hours. After this move it can no longer be cancelled.
    </p>
    <p v-if="formError" class="small text-danger mt-2 mb-0" role="alert">{{ formError }}</p>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template #footer>
      <button type="button" class="btn btn-sm btn-outline-secondary" @click="stack.length > 1 ? back() : closeAll()">Keep my time</button>
      <button
        type="button"
        class="btn btn-sm btn-brand"
        :disabled="store.busyId === topBooking.id || moveChoices.length === 0"
        @click="doMove"
      >
        {{ store.busyId === topBooking.id ? 'Moving...' : 'Move my booking' }}
      </button>
    </template>
  </ClassModal>

  <!-- The teacher cancelled my start time: pick another one -->
  <ClassModal
    v-else-if="top && top.type === 'rebook' && topBooking"
    title="Pick a new time"
    :subtitle="topBooking.title + ' · with ' + topBooking.teacherName"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <p class="small text-muted">
      Pick another start time of this course. Booking it uses <strong>{{ creditsText(topBooking.creditCost) }}</strong> again
      (you got them back when {{ topBooking.teacherName }} cancelled). Your chat stays with the class.
    </p>
    <LoadingText v-if="offersStore.loading && rebookChoices.length === 0" text="Loading start times..." />
    <fieldset v-else-if="rebookChoices.length > 0" class="mb-0">
      <legend class="visually-hidden">New start time</legend>
      <label v-for="slot in rebookChoices" :key="slot.id" class="move-choice">
        <input v-model="moveSlotId" type="radio" name="rebook-slot" :value="slot.id" class="form-check-input mt-0" />
        <span>{{ formatTime(slot.startsAt) }}</span>
        <small class="text-muted ms-auto">{{ slot.spotsLeft }} seat{{ slot.spotsLeft === 1 ? '' : 's' }} left</small>
      </label>
    </fieldset>
    <div v-else class="mb-0">
      <p class="mb-2">There is no other start time with a free seat right now.</p>
      <button type="button" class="btn btn-sm btn-outline-dark" @click="openChat(topBooking)">
        Ask {{ topBooking.teacherName }} for another time
      </button>
    </div>
    <p v-if="formError" class="small text-danger mt-2 mb-0" role="alert">{{ formError }}</p>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template #footer>
      <button type="button" class="btn btn-sm btn-outline-secondary" @click="stack.length > 1 ? back() : closeAll()">Not now</button>
      <button
        type="button"
        class="btn btn-sm btn-brand"
        :disabled="store.busyId === topBooking.id || rebookChoices.length === 0"
        @click="doRebook"
      >
        {{ store.busyId === topBooking.id ? 'Booking...' : 'Book this time' }}
      </button>
    </template>
  </ClassModal>

  <!-- Drop the course: free after the teacher cancelled my start time; otherwise (free cancellation
       is over) the held credits go to the teacher -->
  <ClassModal
    v-else-if="top && top.type === 'drop' && topBooking"
    title="Drop this course?"
    :subtitle="topBooking.title + ' · with ' + topBooking.teacherName"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <template v-if="topBooking.awaitingNewTime">
      <p class="mb-2">
        There's nothing to pay: you already got your <strong>{{ creditsText(topBooking.creditCost) }}</strong> back
        when {{ topBooking.teacherName }} cancelled.
      </p>
      <p class="small text-muted mb-0">
        The class stops waiting for a new time and its chat closes. You can still book the course again later from Courses.
      </p>
    </template>
    <template v-else>
      <p class="mb-2">
        Free cancellation has ended, so your <strong>{{ creditsText(topBooking.dropPenalty || topBooking.creditCost) }}</strong>
        will go to {{ topBooking.teacherName }}. You won't get {{ (topBooking.dropPenalty || topBooking.creditCost) === 1 ? 'it' : 'them' }} back.
      </p>
      <p class="small text-muted mb-0">
        Your seat is freed, the chat closes and the class leaves your list. This can't be undone.
      </p>
    </template>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template #footer>
      <button type="button" class="btn btn-sm btn-outline-secondary" @click="stack.length > 1 ? back() : closeAll()">Keep it</button>
      <button type="button" class="btn btn-sm btn-danger" :disabled="store.busyId === topBooking.id" @click="doDrop(topBooking)">
        {{ store.busyId === topBooking.id ? 'Dropping...' : topBooking.awaitingNewTime ? 'Yes, drop it' : 'Drop and give up credits' }}
      </button>
    </template>
  </ClassModal>

  <!-- Reflections: all the stages of a class I attend -->
  <ClassModal
    v-else-if="top && top.type === 'reflection' && topBooking"
    title="Reflections"
    :subtitle="topBooking.title + ' · ' + topBooking.totalStageCount + ' stage' + (topBooking.totalStageCount === 1 ? '' : 's')"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <p class="small text-muted">
      Write what you learned in each stage, then send them all together. {{ topBooking.teacherName }} accepts or
      sends back each one. When every reflection is accepted, the course is finished and you get its skill card.
    </p>
    <div v-for="(stage, index) in topBooking.stageProgress" :key="index" class="reflection-stage">
      <div class="d-flex justify-content-between align-items-center gap-2 mb-1">
        <label :for="'reflection-' + index" class="form-label fw-semibold mb-0">{{ index + 1 }}. {{ stage.stageName }}</label>
        <span class="stage-pill flex-shrink-0" :class="'stage-' + stageState(stage)">{{ stageLabels[stageState(stage)] }}</span>
      </div>
      <p v-if="stage.approved" class="small mb-0 locked-reflection">{{ stage.reflection }}</p>
      <template v-else>
        <p v-if="stage.rejected" class="alert alert-warning small py-2 mb-2" role="note">
          {{ topBooking.teacherName }} sent this back. Please rewrite it.
          <span v-if="stage.rejectNote" class="d-block mt-1">Their note: "{{ stage.rejectNote }}"</span>
        </p>
        <textarea
          :id="'reflection-' + index"
          v-model="reflectionTexts[index]"
          class="form-control"
          rows="4"
          maxlength="2000"
          :placeholder="'What did you learn in ' + stage.stageName + '? What was hard?'"
        ></textarea>
        <small class="text-muted">{{ (reflectionTexts[index] || '').length }}/2000</small>
      </template>
    </div>
    <p v-if="formError" class="small text-danger mt-2 mb-0" role="alert">{{ formError }}</p>
    <div v-if="store.actionError" class="alert alert-danger small mt-2 mb-0" role="alert">{{ store.actionError }}</div>

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="stack.length > 1 ? back() : closeAll()">Cancel</button>
      <button type="button" class="btn btn-brand" :disabled="store.busyId === topBooking.id" @click="submitReflection">
        {{ store.busyId === topBooking.id ? 'Sending...' : 'Send reflections' }}
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
        <strong class="d-block text-truncate">
          {{ b.learnerName }}
          <span v-if="newStudentIds.includes(b.id)" class="new-tag">New</span>
        </strong>
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
    <EmptyState
      v-if="studentsOf(topOffer.id).length === 0 && pastStudentsOf(topOffer.id).length === 0"
      icon="🪑"
      title="Nobody has booked this class yet."
    />
    <p v-else-if="studentsOf(topOffer.id).length === 0" class="small text-muted mb-0">No current students.</p>

    <!-- past students: finished the course; only the chat (with all its old messages) is offered -->
    <template v-if="pastStudentsOf(topOffer.id).length > 0">
      <h3 class="h6 mt-3 mb-2">Past students</h3>
      <div v-for="b in pastStudentsOf(topOffer.id)" :key="b.id" class="student-row past-student">
        <span class="min-w-0">
          <strong class="d-block text-truncate">{{ b.learnerName }}</strong>
          <small class="text-muted">Completed{{ b.finishedAt ? ' ' + formatTime(b.finishedAt) : '' }}</small>
        </span>
        <button type="button" class="btn btn-sm btn-outline-dark position-relative flex-shrink-0" @click="openChat(b)">
          Chat
          <span v-if="unreadOf(b) > 0" class="count-alert count-corner">
            {{ unreadOf(b) }}<span class="visually-hidden"> unread messages</span>
          </span>
        </button>
      </div>
    </template>
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
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span class="min-w-0 flex-grow-1">{{ index + 1 }}. {{ stage.stageName }}</span>
          <span class="d-flex align-items-center gap-2 flex-shrink-0">
            <span class="stage-pill" :class="'stage-' + stageState(stage)">{{ stageLabels[stageState(stage)] }}</span>
            <button
              v-if="stage.reflection"
              type="button"
              class="btn btn-sm btn-outline-secondary reflection-button"
              :aria-expanded="openReflections.includes(index) ? 'true' : 'false'"
              @click="toggleReflection(index)"
            >
              {{ openReflections.includes(index) ? 'Hide' : 'Read' }}
              <span v-if="stageState(stage) === 'waiting'" class="review-badge ms-1">!</span>
            </button>
          </span>
        </div>
        <div v-if="openReflections.includes(index)" class="reflection-box mt-2">
          <p class="mb-2">{{ stage.reflection }}</p>
          <p v-if="stage.rejected" class="small text-muted mb-0">
            You sent this back<template v-if="stage.rejectNote">: "{{ stage.rejectNote }}"</template>. Waiting for
            {{ topBooking.learnerName }} to rewrite it.
          </p>
          <template v-else-if="!stage.approved && topBooking.status === 'booked'">
            <div v-if="rejectingIndex === index" class="mb-2">
              <label :for="'reject-note-' + index" class="form-label small mb-1">What should they change? (optional)</label>
              <textarea :id="'reject-note-' + index" v-model="rejectNote" class="form-control form-control-sm mb-2" rows="2" maxlength="300"></textarea>
              <div class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-danger" :disabled="store.busyId === topBooking.id" @click="reject(topBooking, index)">
                  Send back
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="rejectingIndex = -1">Never mind</button>
              </div>
            </div>
            <div v-else class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm btn-brand" :disabled="store.busyId === topBooking.id" @click="approve(topBooking, index)">
                Accept
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger" @click="startReject(index)">Reject</button>
            </div>
          </template>
        </div>
      </div>
      <p v-if="topBooking.status === 'booked'" class="small text-muted mt-2 mb-0">
        The course is finished when you have accepted every reflection.
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

  <!-- Start times of a class I host: move or cancel one, or add a new one -->
  <ClassModal
    v-else-if="top && top.type === 'slot' && topOffer"
    title="Start times"
    :subtitle="topOffer.title"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <template v-if="upcomingSlots(topOffer).length > 0">
      <div v-for="slot in upcomingSlots(topOffer)" :key="slot.id" class="slot-row">
        <span class="min-w-0">
          <strong class="d-block">{{ slotLabel(slot) }}</strong>
          <small class="text-muted">
            {{ slot.taken }}/{{ slot.capacity }} booked<template v-if="slot.moves > 0"> &middot; moved {{ slot.moves }} of 2 times</template>
          </small>
        </span>
        <span class="d-flex gap-2 flex-shrink-0">
          <button type="button" class="btn btn-sm btn-outline-secondary" :aria-label="'Move ' + slotLabel(slot)" @click="openMoveSlot(topOffer, slot)">Move</button>
          <button type="button" class="btn btn-sm btn-outline-danger" :aria-label="'Cancel ' + slotLabel(slot)" @click="openCancelSlot(topOffer, slot)">Cancel</button>
        </span>
      </div>
    </template>
    <p v-else class="small text-muted">No upcoming start times yet.</p>

    <h3 class="h6 mt-3">Add a start time</h3>
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

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="closeAll">Close</button>
      <button type="button" class="btn btn-brand" :disabled="savingSlot" @click="addSlot">
        {{ savingSlot ? 'Adding...' : 'Add start time' }}
      </button>
    </template>
  </ClassModal>

  <!-- Move one start time -->
  <ClassModal
    v-else-if="top && top.type === 'moveSlot' && topOffer && topSlot"
    title="Move this start time"
    :subtitle="topOffer.title + ' · ' + slotLabel(topSlot)"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <template v-if="topSlot.taken > 0">
      <p class="mb-2">
        The {{ studentsText(topSlot.taken) }} booked at this time will move with it. They'll get a notice,
        and can cancel for a full refund until the new start if it doesn't suit them.
      </p>
      <p class="small text-muted">
        The new time must be more than 24 hours from now. A start time with students can be moved until
        2 hours before it begins, at most 2 times<template v-if="topSlot.moves > 0"> (moved {{ topSlot.moves }} so far)</template>.
      </p>
    </template>
    <p v-else class="small text-muted">Nobody has booked this time yet, so you can change it freely.</p>

    <p v-if="slotMoveProblem(topSlot)" class="alert alert-warning small" role="note">{{ slotMoveProblem(topSlot) }}</p>
    <template v-else>
      <div class="row g-2">
        <div class="col-12 col-sm-6">
          <label for="move-date" class="form-label">New date</label>
          <input id="move-date" v-model="slotForm.date" type="date" class="form-control" :min="todayText()" />
        </div>
        <div class="col-12 col-sm-6">
          <label for="move-time" class="form-label">New time</label>
          <input id="move-time" v-model="slotForm.time" type="time" class="form-control" />
        </div>
      </div>
      <template v-if="topSlot.taken > 0">
        <label for="move-note" class="form-label mt-3">Note to your students (optional)</label>
        <textarea id="move-note" v-model="slotForm.text" class="form-control" rows="2" maxlength="300" placeholder="e.g. Sorry, I have a clash at work."></textarea>
      </template>
    </template>
    <p v-if="formError" class="small text-danger mt-2 mb-0" role="alert">{{ formError }}</p>

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="back">Back</button>
      <button type="button" class="btn btn-brand" :disabled="savingSlot || slotMoveProblem(topSlot) !== ''" @click="doMoveSlot">
        {{ savingSlot ? 'Moving...' : 'Move start time' }}
      </button>
    </template>
  </ClassModal>

  <!-- Cancel one start time -->
  <ClassModal
    v-else-if="top && top.type === 'cancelSlot' && topOffer && topSlot"
    title="Cancel this start time?"
    :subtitle="topOffer.title + ' · ' + slotLabel(topSlot)"
    :can-go-back="stack.length > 1"
    @back="back"
    @close="closeAll"
  >
    <template v-if="topSlot.taken > 0">
      <p class="mb-2">
        The {{ studentsText(topSlot.taken) }} booked at this time will get a <strong>full refund</strong> and a notice
        with your reason. This can't be undone.
      </p>
      <label for="cancel-reason" class="form-label">Reason (your students will see it)</label>
      <textarea id="cancel-reason" v-model="slotForm.text" class="form-control" rows="3" maxlength="300"></textarea>
    </template>
    <p v-else class="mb-0">Nobody has booked this time, so it will simply be removed.</p>
    <p v-if="formError" class="small text-danger mt-2 mb-0" role="alert">{{ formError }}</p>

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="back">Keep it</button>
      <button type="button" class="btn btn-danger" :disabled="savingSlot" @click="doCancelSlot">
        {{ savingSlot ? 'Cancelling...' : topSlot.taken > 0 ? 'Cancel and refund' : 'Remove start time' }}
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

/* one start time in the "Start times" popup, and one choice in "Move to another time" */
.slot-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--k-border);
}

.slot-row:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.move-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--k-border);
  border-radius: 10px;
  cursor: pointer;
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

/* a class I cancelled (or was removed from): its title in a lighter grey */
/* the teacher cancelled my start time: what I can do next */
.new-time-box {
  background: #fdf6e3;
  border-left: 4px solid #c9a227;
  border-radius: 0.5rem;
  padding: 0.75rem 0.9rem;
  color: #4a3b1f;
}

.cancelled-title {
  color: #a39a8e;
}

/* "New" next to a student who joined since the teacher last opened the Students list */
.new-tag {
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--k-danger);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
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

.stage-rejected {
  background: #fde8e6;
  color: #a12b1f;
}

/* one stage in the student's Reflections popup */
.reflection-stage {
  padding: 12px 0;
  border-top: 1px solid var(--k-border);
}

.reflection-stage:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.locked-reflection {
  white-space: pre-wrap;
  color: var(--k-muted);
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
