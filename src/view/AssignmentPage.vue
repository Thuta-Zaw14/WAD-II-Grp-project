<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import BackButton from '@/components/BackButton.vue'
import LoadingText from '@/components/LoadingText.vue'
import StarRating from '@/components/progress/StarRating.vue'
import EvidenceUploader from '@/components/progress/EvidenceUploader.vue'
import EvidenceGallery from '@/components/progress/EvidenceGallery.vue'
import CommentThread from '@/components/progress/CommentThread.vue'
import SubmissionReview from '@/components/progress/SubmissionReview.vue'
import AssignmentFormModal from '@/components/progress/AssignmentFormModal.vue'
import {
  getAssignment, submitWork, sendSubmissionComment, reviewSubmission, markSubmissionSeen, deleteAssignment, errorText,
} from '@/services/api'
import { rememberMedia } from '@/services/progressMedia'
import { learnerStatus, STATUS_INFO, timeLeftText, formatDue } from '@/services/progressRules'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

// One assignment.
//   A student: the instructions, their work (send it, change it until it is graded), the grade
//              and feedback, and comments with the instructor.
//   The instructor: every student's work, one at a time (?student=uid in the address), with the
//              grading box and comments. They can also edit (e.g. extend the due date) or remove it.
const props = defineProps({ id: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const store = useProgressStore()
const toast = useToastStore()

const data = ref(null)
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const busy = ref(false)
const now = ref(new Date())
const thread = ref(null)
let clock = null

onMounted(() => {
  load()
  clock = setInterval(() => {
    now.value = new Date()
  }, 60 * 1000)
})
onUnmounted(() => clearInterval(clock))
watch(() => props.id, load)

async function load() {
  loadError.value = ''
  try {
    data.value = await getAssignment(props.id)
    if (data.value.role === 'learner') fillForm()
    markSeen()
  } catch (err) {
    loadError.value = err.response && err.response.status === 404
      ? 'This assignment does not exist or is not yours.'
      : 'Could not load the assignment: ' + errorText(err)
  }
  loading.value = false
}

const assignment = computed(() => data.value && data.value.assignment)
const isTeacher = computed(() => data.value && data.value.role === 'teacher')

// ========== The student ==========
const submission = computed(() => (data.value && data.value.submission) || null)
const status = computed(() =>
  data.value && !isTeacher.value
    ? learnerStatus({ ...assignment.value, submission: submission.value, missed: data.value.missed }, now.value)
    : ''
)
const editing = ref(false)
const photos = ref([])
const links = ref([''])
const note = ref('')
const formError = ref('')

// start the form from the work already sent
function fillForm() {
  const sent = submission.value
  photos.value = sent ? sent.mediaIds.map((mediaId) => ({ mediaId })) : []
  links.value = sent && sent.links.length ? [...sent.links] : ['']
  note.value = sent ? sent.note : ''
  editing.value = !sent || sent.status === 'redo'
  formError.value = ''
}

async function send() {
  formError.value = ''
  const cleanLinks = links.value.map((l) => l.trim()).filter((l) => l !== '')
  if (photos.value.length === 0 && cleanLinks.length === 0) {
    formError.value = 'Add at least one photo or video link to show your progress.'
    return
  }
  for (const link of cleanLinks) {
    if (!/^https?:\/\/\S+$/.test(link)) {
      formError.value = '"' + link.slice(0, 40) + '" is not a link. It should start with https://'
      return
    }
  }
  const newPhotos = photos.value.filter((p) => !p.mediaId)
  busy.value = true
  try {
    const result = await submitWork(props.id, {
      note: note.value,
      links: cleanLinks,
      keepMediaIds: photos.value.filter((p) => p.mediaId).map((p) => p.mediaId),
      images: newPhotos.map((p) => p.dataUrl),
    })
    // the new photos are the last ids, in the order they were sent: no need to download them again
    const ids = result.submission.mediaIds
    newPhotos.forEach((photo, index) => rememberMedia(ids[ids.length - newPhotos.length + index], photo.dataUrl))
    toast.show(submission.value ? 'Your work was updated.' : 'Your work was sent to ' + assignment.value.teacherName + '.')
    await load()
    store.refreshOverview()
  } catch (err) {
    formError.value = errorText(err)
  }
  busy.value = false
}

// ========== The instructor ==========
const students = computed(() => (isTeacher.value ? data.value.students : []))
const selectedUid = computed(() => {
  const wanted = route.query.student
  if (wanted && students.value.some((s) => s.uid === wanted)) return wanted
  const waiting = students.value.find((s) => s.submission && s.submission.status === 'submitted')
  return (waiting || students.value[0] || {}).uid || ''
})
const selected = computed(() => students.value.find((s) => s.uid === selectedUid.value) || null)
const sentCount = computed(() => students.value.filter((s) => s.submission).length)

function pick(uid) {
  router.replace({ query: { student: uid } })
}
watch(selectedUid, () => {
  actionError.value = ''
  markSeen()
})

function teacherStatus(student) {
  if (!student.submission) return student.missed ? 'missed' : 'notSent'
  return { submitted: 'toReview', reviewed: 'graded', redo: 'redo' }[student.submission.status]
}

const TEACHER_STATUS = {
  notSent: { label: 'Not sent yet', tone: 'neutral' },
  missed: { label: 'Missed', tone: 'danger' },
  toReview: { label: 'To review', tone: 'warning' },
  graded: { label: 'Graded', tone: 'success' },
  redo: { label: 'Redo asked', tone: 'info' },
}

async function grade(review) {
  actionError.value = ''
  busy.value = true
  try {
    await reviewSubmission(selected.value.submission.id, { action: 'grade', ...review })
    toast.show('Grade saved. ' + selected.value.name + ' can see it now.')
    await load()
    store.refreshOverview()
  } catch (err) {
    actionError.value = errorText(err)
  }
  busy.value = false
}

async function askRedo(review) {
  actionError.value = ''
  busy.value = true
  try {
    await reviewSubmission(selected.value.submission.id, { action: 'redo', ...review })
    toast.show('Redo request sent to ' + selected.value.name + '.')
    await load()
    store.refreshOverview()
  } catch (err) {
    actionError.value = errorText(err)
  }
  busy.value = false
}

const showEdit = ref(false)
async function onEdited() {
  showEdit.value = false
  toast.show('Assignment updated.')
  await load()
  store.refreshOverview()
}

async function remove() {
  const work = sentCount.value
  const question = 'Remove "' + assignment.value.title + '"?' + (work ? ' The work ' + work + ' student(s) sent will be deleted too.' : '')
  if (!window.confirm(question)) return
  busy.value = true
  try {
    await deleteAssignment(props.id)
    toast.show('Assignment removed.')
    await store.fetchOverview()
    router.push({ path: '/progress', query: { tab: 'teaching' } })
  } catch (err) {
    actionError.value = errorText(err)
    busy.value = false
  }
}

// ========== Both ==========
// the work shown in the comment box and the gallery: mine, or the picked student's
const openSubmission = computed(() => (isTeacher.value ? selected.value && selected.value.submission : submission.value))

async function sendComment(text) {
  busy.value = true
  try {
    await sendSubmissionComment(openSubmission.value.id, text)
    thread.value && thread.value.clear()
    await load()
  } catch (err) {
    toast.show(errorText(err))
  }
  busy.value = false
}

// opening work with news (a new grade, a comment) clears its red number
async function markSeen() {
  const open = openSubmission.value
  if (!open || !open.news) return
  try {
    await markSubmissionSeen(open.id)
    open.news = false
    store.refreshOverview()
  } catch {
    // only the red number: it will be cleared next time
  }
}

const dueText = computed(() => (assignment.value ? timeLeftText(assignment.value.dueAt, now.value) : ''))
</script>

<template>
  <NavBar />

  <main class="container py-4 assignment-page">
    <BackButton fallback="/progress" class="mb-3" />

    <LoadingText v-if="loading" text="Loading the assignment..." />
    <div v-else-if="loadError" class="alert alert-danger" role="alert">{{ loadError }}</div>

    <template v-else-if="assignment">
      <!-- ----- the assignment ----- -->
      <header class="banner p-4 mb-4">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div class="min-w-0">
            <p class="eyebrow mb-1">{{ assignment.courseTitle }}</p>
            <h1 class="h3 mb-1 text-break" data-testid="assignment-heading">{{ assignment.title }}</h1>
            <p class="mb-0 text-muted small">
              {{ isTeacher ? sentCount + ' of ' + students.length + ' student' + (students.length === 1 ? '' : 's') + ' sent their work' : 'Set by ' + assignment.teacherName }}
              · Due {{ formatDue(assignment.dueAt) }}
              <span class="due-left" :class="{ closed: new Date(assignment.dueAt) < now }">({{ dueText }})</span>
            </p>
          </div>
          <div class="d-flex gap-2 align-items-center flex-wrap">
            <span v-if="!isTeacher" class="status" :class="'tone-' + STATUS_INFO[status].tone" data-testid="my-status">
              {{ STATUS_INFO[status].label }}
            </span>
            <template v-if="isTeacher">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-testid="edit-assignment" @click="showEdit = true">Edit / extend</button>
              <button type="button" class="btn btn-sm btn-outline-danger" :disabled="busy" data-testid="delete-assignment" @click="remove">Remove</button>
            </template>
          </div>
        </div>
        <div class="instructions mt-3">
          <p class="eyebrow mb-1">WHAT TO PRACTISE</p>
          <p class="mb-0" data-testid="assignment-instructions-text">{{ assignment.instructions }}</p>
        </div>
      </header>

      <div v-if="actionError" class="alert alert-danger" role="alert">{{ actionError }}</div>

      <!-- ===================== the student ===================== -->
      <div v-if="!isTeacher" class="row g-4">
        <div class="col-12 col-lg-7">
          <!-- what the instructor said -->
          <div v-if="submission && submission.status === 'redo'" class="alert alert-warning" role="status" data-testid="redo-alert">
            <strong>{{ assignment.teacherName }} asked you to redo this:</strong> {{ submission.redoNote }}
            <div v-if="data.canSubmit" class="small mt-1">Send new work by {{ formatDue(submission.redoUntil) }}.</div>
          </div>

          <section v-if="submission && submission.status === 'reviewed'" class="k-card feedback p-3 p-md-4 mb-4" data-testid="my-grade">
            <p class="eyebrow mb-2">FEEDBACK FROM {{ assignment.teacherName.toUpperCase() }}</p>
            <StarRating :model-value="submission.stars" readonly size="lg" />
            <p v-if="submission.feedback" class="mt-2 mb-0 feedback-text">{{ submission.feedback }}</p>
            <p v-if="submission.stars === 5" class="small mt-2 mb-0 fw-semibold">⭐ Star student! That's a badge.</p>
          </section>

          <section class="k-card p-3 p-md-4" aria-labelledby="work-title">
            <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
              <h2 id="work-title" class="h5 mb-0">Your work</h2>
              <button
                v-if="submission && data.canSubmit && !editing"
                type="button"
                class="btn btn-sm btn-outline-secondary"
                data-testid="edit-work"
                @click="editing = true"
              >Edit my work</button>
            </div>

            <form v-if="editing && data.canSubmit" novalidate data-testid="work-form" @submit.prevent="send">
              <EvidenceUploader v-model:photos="photos" v-model:links="links" />
              <label for="work-note" class="form-label mt-3">Note to your instructor <span class="text-muted small">(optional)</span></label>
              <textarea
                id="work-note"
                v-model="note"
                class="form-control"
                rows="3"
                maxlength="1000"
                placeholder="How did the practice go? What felt hard?"
                data-testid="work-note"
              ></textarea>
              <div v-if="formError" class="alert alert-danger py-2 mt-3 mb-0" role="alert" data-testid="work-error">{{ formError }}</div>
              <div class="d-flex justify-content-end gap-2 mt-3">
                <button v-if="submission && submission.status !== 'redo'" type="button" class="btn btn-outline-secondary" @click="fillForm">Cancel</button>
                <button type="submit" class="btn btn-brand" :disabled="busy" data-testid="send-work">
                  {{ busy ? 'Sending...' : submission ? 'Send again' : 'Send my work' }}
                </button>
              </div>
            </form>

            <template v-else-if="submission">
              <p class="small text-muted mb-3">Sent {{ formatDue(submission.submittedAt) }}</p>
              <EvidenceGallery :media-ids="submission.mediaIds" :links="submission.links" :note="submission.note" />
            </template>

            <p v-else-if="data.missed" class="text-muted mb-0" data-testid="missed-text">
              The due date passed before you sent anything. Ask {{ assignment.teacherName }} in the comments or the class chat if you need more time.
            </p>
            <p v-else class="text-muted mb-0">{{ data.closedReason }}</p>
          </section>
        </div>

        <div class="col-12 col-lg-5">
          <section class="k-card p-3 p-md-4">
            <CommentThread
              v-if="submission"
              ref="thread"
              :comments="submission.comments"
              my-role="learner"
              :busy="busy"
              @send="sendComment"
            />
            <div v-else>
              <h3 class="h6">Tips</h3>
              <ul class="small text-muted mb-0 ps-3 tips">
                <li>Show the skill in action: a short video says more than a long note.</li>
                <li>Upload videos to YouTube as <em>unlisted</em> and paste the link.</li>
                <li>You can change your work until it is graded or the due date passes.</li>
                <li>Hand in on time to keep your 🔥 streak going.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>

      <!-- ===================== the instructor ===================== -->
      <div v-else class="row g-4">
        <div class="col-12 col-lg-4">
          <section class="k-card p-2 p-md-3" aria-labelledby="students-title">
            <h2 id="students-title" class="h6 px-2 pt-1 mb-2">Students</h2>
            <ul class="student-picker list-unstyled mb-0" role="list">
              <li v-for="student in students" :key="student.uid">
                <button
                  type="button"
                  class="student-button"
                  :class="{ active: student.uid === selectedUid }"
                  :aria-current="student.uid === selectedUid ? 'true' : 'false'"
                  data-testid="student-button"
                  @click="pick(student.uid)"
                >
                  <span class="fw-semibold text-truncate">{{ student.name }}</span>
                  <span class="status" :class="'tone-' + TEACHER_STATUS[teacherStatus(student)].tone">
                    {{ TEACHER_STATUS[teacherStatus(student)].label }}
                    <span v-if="student.submission && student.submission.news" aria-label="new comment">●</span>
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>

        <div v-if="selected" class="col-12 col-lg-8">
          <section class="k-card p-3 p-md-4 mb-4" aria-labelledby="their-work-title" data-testid="student-work">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <h2 id="their-work-title" class="h5 mb-0">{{ selected.name }}'s work</h2>
              <StarRating v-if="selected.submission && selected.submission.stars" :model-value="selected.submission.stars" readonly />
            </div>

            <template v-if="selected.submission">
              <p class="small text-muted mb-3">
                Sent {{ formatDue(selected.submission.submittedAt) }}
                <span v-if="selected.submission.firstSubmittedAt !== selected.submission.submittedAt"> (updated)</span>
              </p>
              <EvidenceGallery
                :media-ids="selected.submission.mediaIds"
                :links="selected.submission.links"
                :note="selected.submission.note"
              />
            </template>
            <p v-else class="text-muted mb-0">
              {{ selected.missed ? selected.name + ' did not send anything before the due date. You can extend the due date with "Edit / extend".' : selected.name + ' has not sent their work yet.' }}
            </p>
          </section>

          <SubmissionReview
            v-if="selected.submission"
            class="mb-4"
            :submission="selected.submission"
            :busy="busy"
            @grade="grade"
            @redo="askRedo"
          />

          <section v-if="selected.submission" class="k-card p-3 p-md-4">
            <CommentThread
              ref="thread"
              :comments="selected.submission.comments"
              my-role="teacher"
              :busy="busy"
              @send="sendComment"
            />
          </section>
        </div>
      </div>

      <AssignmentFormModal
        v-if="showEdit"
        :course="{ offerId: assignment.offerId, title: assignment.courseTitle }"
        :students="data.otherStudents"
        :assignment="assignment"
        @close="showEdit = false"
        @saved="onEdited"
      />
    </template>
  </main>
</template>

<style scoped>
.assignment-page {
  max-width: 1140px;
}

.min-w-0 {
  min-width: 0;
}

.instructions {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--k-surface);
  border: 1px solid var(--k-border);
}

.instructions p:last-child {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.due-left.closed {
  color: var(--k-danger);
}

.feedback {
  background: linear-gradient(180deg, #fff8ea 0%, var(--k-surface) 100%);
  border-color: #ecd3a8;
}

.feedback-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tips li + li {
  margin-top: 6px;
}

/* the instructor's list of students: a column on a computer, a row you can swipe on a phone */
.student-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.student-button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: none;
  color: var(--k-text);
  text-align: left;
  min-width: 0;
}

.student-button:hover {
  background: var(--k-surface-alt);
}

.student-button.active {
  border-color: var(--k-brand);
  background: #fff6ea;
}

.student-button:focus-visible {
  outline: 3px solid rgba(154, 106, 68, 0.4);
}

@media (max-width: 991.98px) {
  .student-picker {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
    scroll-snap-type: x proximity;
  }

  .student-picker li {
    flex: 0 0 auto;
    scroll-snap-align: start;
  }

  .student-button {
    width: auto;
    flex-direction: column;
    align-items: flex-start;
    border-color: var(--k-border);
    max-width: 220px;
  }
}
</style>
