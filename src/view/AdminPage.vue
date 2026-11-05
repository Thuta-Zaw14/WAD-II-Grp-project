<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import {
  getAdminUsers, getDisputes, settleDispute, getDisputeMessages, getMessageReports,
  getAllReports, updateReportAsAdmin, errorText,
} from '../services/api'
import AdminMessageReports from '../components/AdminMessageReports.vue'
import LoadingText from '../components/LoadingText.vue'
import { useToastStore } from '../stores/toast'

const router = useRouter()
const toast = useToastStore()

// ---------- What is shown ----------
const tab = ref('users') // 'users', 'disputes' or 'messages'
const users = ref([])
const disputes = ref({ open: [], settled: [] })
const messageReports = ref({ open: [], handled: [] })
const memberReports = ref([]) // the reports members send from the Reports page
const loading = ref(true)
const error = ref('')

async function logout() {
  try {
    await signOut(auth)
    router.push('/login')
  } catch (err) {
    console.log(err)
  }
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    users.value = await getAdminUsers()
    disputes.value = await getDisputes()
    messageReports.value = await getMessageReports()
    memberReports.value = await getAllReports()
  } catch (err) {
    error.value = 'Could not load the admin data: ' + errorText(err)
  }
  loading.value = false
}

function showUserProfile(uid) {
  router.push('/admins/users/' + uid)
}

// "02/11/2026"
function formatDate(iso) {
  if (!iso) return 'N/A'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ---------- Numbers at the top ----------
const totalReports = computed(() => {
  let total = 0
  for (const user of users.value) total += user.reports
  return total
})

const bannedUsers = computed(() => users.value.filter((user) => user.isBanned).length)

// a member report is still waiting until an admin marks it resolved
const openMemberReports = computed(() => memberReports.value.filter((r) => r.status !== 'resolved'))
const resolvedMemberReports = computed(() => memberReports.value.filter((r) => r.status === 'resolved'))

// what the Disputes tab is waiting on: booking problems plus member reports
const openDisputeCount = computed(() => disputes.value.open.length + openMemberReports.value.length)

// the three buttons that switch between the sections
const tabs = computed(() => [
  { id: 'users', label: 'Users', count: 0 },
  { id: 'disputes', label: 'Disputes', count: openDisputeCount.value },
  { id: 'messages', label: 'Message reports', count: messageReports.value.open.length },
])

// ---------- Settling a dispute ----------
// Choosing a dispute opens a small panel under it: a note, then one of two buttons.
const openId = ref('')
const note = ref('')
const settling = ref(false)
const settleError = ref('')

function openSettle(id) {
  openId.value = openId.value === id ? '' : id
  note.value = ''
  settleError.value = ''
}

function creditsText(count) {
  return count + ' credit' + (count === 1 ? '' : 's')
}

async function settle(dispute, decision) {
  if (settling.value) return
  const question =
    decision === 'pay-teacher'
      ? 'Pay ' + creditsText(dispute.creditCost) + ' to ' + dispute.teacherName + '?'
      : 'Refund ' + creditsText(dispute.creditCost) + ' to ' + dispute.learnerName + '?'
  if (!window.confirm(question + ' This cannot be undone.')) return

  settling.value = true
  settleError.value = ''
  try {
    await settleDispute(dispute.bookingId, decision, note.value)
    toast.show(
      decision === 'pay-teacher'
        ? dispute.teacherName + ' was paid ' + creditsText(dispute.creditCost) + '.'
        : dispute.learnerName + ' was refunded ' + creditsText(dispute.creditCost) + '.'
    )
    openId.value = ''
    await loadAll() // the lists and the report counts change
  } catch (err) {
    settleError.value = errorText(err)
  }
  settling.value = false
}

// ---------- Reading the chat of a reported booking ----------
const chatId = ref('') // the booking whose chat is showing
const chatMessages = ref([])
const chatLoading = ref(false)
const chatError = ref('')

async function toggleChat(id) {
  if (chatId.value === id) {
    chatId.value = ''
    return
  }
  chatId.value = id
  chatMessages.value = []
  chatError.value = ''
  chatLoading.value = true
  try {
    const data = await getDisputeMessages(id)
    chatMessages.value = data.messages
  } catch (err) {
    chatError.value = errorText(err)
  }
  chatLoading.value = false
}

// "8 Nov, 14:05" in Singapore time
function formatChatTime(iso) {
  return new Date(iso).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const outcomeLabels = {
  'teacher-paid': 'Teacher paid',
  'student-refunded': 'Student refunded',
}

// ---------- Member reports (sent from the Reports page) ----------
// The same words the Reports page uses, so the admin and the member see the same thing.
const reportTypeLabels = {
  user: 'User-based',
  course: 'Course-based',
  website: 'Website',
  other: 'Others',
}

const reportStatusLabels = {
  open: 'Open',
  'in-review': 'Being looked at',
  resolved: 'Resolved',
}

// Choosing "Review" opens a panel under the report: a new status and a reply for the member.
const reviewId = ref('')
const reviewStatus = ref('in-review')
const reviewNote = ref('')
const savingReview = ref(false)
const reviewError = ref('')

function openReview(report) {
  if (reviewId.value === report.id) {
    reviewId.value = ''
    return
  }
  reviewId.value = report.id
  reviewStatus.value = report.status === 'open' ? 'in-review' : report.status
  reviewNote.value = report.adminNote
  reviewError.value = ''
}

async function saveReview(report) {
  if (savingReview.value) return
  savingReview.value = true
  reviewError.value = ''
  try {
    const updated = await updateReportAsAdmin(report.id, { status: reviewStatus.value, adminNote: reviewNote.value })
    memberReports.value = memberReports.value.map((r) => (r.id === updated.id ? updated : r))
    toast.show('Report updated. ' + (report.reporterName || 'The member') + ' will see it on their Reports page.')
    reviewId.value = ''
  } catch (err) {
    reviewError.value = errorText(err)
  }
  savingReview.value = false
}

onMounted(loadAll)
</script>

<template>
  <div class="admin-page">
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center gap-2 mb-4">
        <h1 class="page-title mb-0">Admin</h1>
        <button class="btn btn-danger btn-sm" @click="logout">Log Out</button>
      </div>

      <LoadingText v-if="loading" />
      <div v-if="error" class="alert alert-danger">{{ error }}</div>

      <!-- two in a row on a phone, four on a wide screen -->
      <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
          <div class="stat-card">
            <h2 class="stat-label">Total Users</h2>
            <p class="stat-value">{{ users.length }}</p>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="stat-card">
            <h2 class="stat-label">Total Reports</h2>
            <p class="stat-value">{{ totalReports }}</p>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="stat-card">
            <h2 class="stat-label">Open Disputes</h2>
            <p class="stat-value">{{ openDisputeCount }}</p>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="stat-card">
            <h2 class="stat-label">Banned Accounts</h2>
            <p class="stat-value">{{ bannedUsers }}</p>
          </div>
        </div>
      </div>

      <!-- light brown buttons; the one that is open turns dark brown -->
      <div class="admin-tabs mb-3" role="tablist" aria-label="Admin sections">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          class="admin-tab"
          :class="{ active: tab === t.id }"
          :aria-selected="tab === t.id"
          @click="tab = t.id"
        >
          {{ t.label }}
          <span v-if="t.count > 0" class="tab-count">{{ t.count }}</span>
        </button>
      </div>

      <!-- ===== Users ===== -->
      <div v-if="tab === 'users'" class="card custom-card">
        <div class="card-body">
          <!-- scrolls sideways on a narrow screen instead of squashing the columns -->
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Credits</th>
                  <th>Reports</th>
                  <th>Warnings</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="user in users"
                  :key="user.id"
                  :class="{
                    'report-warning': user.reports >= 3 && user.reports < 5,
                    'report-danger': user.reports >= 5,
                    'table-danger': user.isBanned,
                  }"
                >
                  <td>{{ user.name || '(no name yet)' }}</td>
                  <td>{{ user.email }}</td>
                  <td>{{ user.credits }}</td>
                  <td>
                    <span
                      class="badge"
                      :class="{
                        'bg-success': user.reports === 0,
                        'bg-warning text-dark': user.reports > 0 && user.reports < 3,
                        'bg-danger': user.reports >= 3,
                      }"
                    >
                      {{ user.reports }}
                    </span>
                  </td>
                  <td>{{ user.warnings }}</td>
                  <td>{{ formatDate(user.createdAt) }}</td>
                  <td>{{ user.isBanned ? 'Banned' : 'Active' }}</td>
                  <td>
                    <button class="btn btn-brand btn-sm" @click="showUserProfile(user.id)">View</button>
                  </td>
                </tr>

                <tr v-if="!loading && users.length === 0">
                  <td colspan="8" class="text-center text-muted py-4">No users yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ===== Disputes ===== -->
      <div v-if="tab === 'disputes'">

        <!-- Reports about a member, a course, the website or anything else, sent from the Reports page -->
        <div class="card custom-card mb-4">
          <div class="card-body">
            <h2 class="h5 mb-1">Member reports</h2>
            <p class="text-muted small mb-3">
              Sent from the Reports page. Mark a report as being looked at or resolved and write a reply;
              the member sees both on their Reports page.
            </p>

            <p v-if="!loading && openMemberReports.length === 0" class="text-muted mb-0">No reports waiting. 🎉</p>

            <div v-for="r in openMemberReports" :key="r.id" class="dispute border-bottom py-3">
              <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3">
                <div class="flex-grow-1 min-w-0">
                  <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                    <span class="type-badge">{{ reportTypeLabels[r.type] || r.type }}</span>
                    <span class="report-status" :class="'report-' + r.status">{{ reportStatusLabels[r.status] }}</span>
                    <strong>{{ r.title }}</strong>
                  </div>
                  <div v-if="r.type === 'user' || r.type === 'course'" class="small">
                    About {{ r.type === 'user' ? 'member' : 'course' }}:
                    <button
                      v-if="r.type === 'user' && r.targetId"
                      class="btn btn-link btn-sm p-0 reporter-link"
                      @click="showUserProfile(r.targetId)"
                    >{{ r.targetName }}</button>
                    <strong v-else>{{ r.targetName || 'Unknown' }}</strong>
                  </div>
                  <div class="small mt-1">
                    Sent by
                    <button class="btn btn-link btn-sm p-0 reporter-link" @click="showUserProfile(r.reporterUid)">
                      {{ r.reporterName || 'Unknown' }}
                    </button>
                    on {{ formatDate(r.createdAt) }}
                  </div>
                  <div class="quote p-2 rounded mt-2">{{ r.description }}</div>
                  <div v-if="r.adminNote" class="small text-muted mt-2">Your reply: "{{ r.adminNote }}"</div>
                </div>
                <div class="d-flex flex-wrap gap-2 flex-shrink-0">
                  <button class="btn btn-sm btn-outline-dark" @click="openReview(r)">
                    {{ reviewId === r.id ? 'Close' : 'Review' }}
                  </button>
                </div>
              </div>

              <div v-if="reviewId === r.id" class="settle-box mt-3 p-3 rounded">
                <label :for="'status-' + r.id" class="form-label small fw-semibold">Status</label>
                <select :id="'status-' + r.id" v-model="reviewStatus" class="form-select form-select-sm mb-2">
                  <option value="open">Open</option>
                  <option value="in-review">Being looked at</option>
                  <option value="resolved">Resolved</option>
                </select>
                <label :for="'reply-' + r.id" class="form-label small fw-semibold">Reply to {{ r.reporterName || 'the member' }} (optional)</label>
                <textarea
                  :id="'reply-' + r.id"
                  v-model="reviewNote"
                  class="form-control mb-2"
                  rows="2"
                  maxlength="500"
                  placeholder="e.g. Thanks, we have warned this member."
                ></textarea>
                <p v-if="reviewError" class="text-danger small mb-2">{{ reviewError }}</p>
                <button class="btn btn-sm btn-brand" :disabled="savingReview" @click="saveReview(r)">
                  {{ savingReview ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Bookings where the student or the teacher pressed "Report a problem" -->
        <div class="card custom-card mb-4">
          <div class="card-body">
            <h2 class="h5 mb-1">Booking problems</h2>
            <p class="text-muted small mb-3">
              The credits of these bookings are on hold. Paying the teacher means the course
              happened. Refunding the student means it did not.
            </p>

            <p v-if="!loading && disputes.open.length === 0" class="text-muted mb-0">Nothing to settle. 🎉</p>

            <div v-for="d in disputes.open" :key="d.bookingId" class="dispute border-bottom py-3">
              <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3">
                <div class="flex-grow-1 min-w-0">
                  <strong>{{ d.title }}</strong>
                  <span class="text-muted small ms-2">{{ d.slotDate }} {{ d.slotTime }} · {{ creditsText(d.creditCost) }} on hold</span>
                  <div class="small mt-1">
                    Student:
                    <button class="btn btn-link btn-sm p-0 reporter-link" @click="showUserProfile(d.learnerUid)">{{ d.learnerName }}</button>
                    · Teacher:
                    <button class="btn btn-link btn-sm p-0 reporter-link" @click="showUserProfile(d.teacherUid)">{{ d.teacherName }}</button>
                  </div>
                  <div class="small mt-1">
                    <strong>{{ d.reporterName }}</strong> ({{ d.reporterRole }}) reported on {{ formatDate(d.reportedAt) }}:
                    "{{ d.reason }}"
                  </div>
                </div>
                <div class="d-flex flex-wrap gap-2 flex-shrink-0">
                  <button class="btn btn-sm btn-outline-secondary" @click="toggleChat(d.bookingId)">
                    {{ chatId === d.bookingId ? 'Hide chat' : 'View chat' }}
                  </button>
                  <button class="btn btn-sm btn-outline-dark" @click="openSettle(d.bookingId)">
                    {{ openId === d.bookingId ? 'Close' : 'Decide' }}
                  </button>
                </div>
              </div>

              <!-- what the two people wrote to each other -->
              <div v-if="chatId === d.bookingId" class="chat-box mt-3 p-3 rounded">
                <p v-if="chatLoading" class="small text-muted mb-0">Loading the chat...</p>
                <p v-else-if="chatError" class="small text-danger mb-0">{{ chatError }}</p>
                <p v-else-if="chatMessages.length === 0" class="small text-muted mb-0">They never wrote to each other.</p>
                <div v-for="m in chatMessages" :key="m.n" class="mb-2">
                  <span class="small text-muted">{{ m.senderName }} ({{ m.role === 'learner' ? 'student' : 'teacher' }}) · {{ formatChatTime(m.createdAt) }}</span>
                  <div class="chat-text">{{ m.text }}</div>
                </div>
              </div>

              <div v-if="openId === d.bookingId" class="settle-box mt-3 p-3 rounded">
                <label :for="'note-' + d.bookingId" class="form-label small fw-semibold">
                  Note for both people (optional)
                </label>
                <textarea
                  :id="'note-' + d.bookingId"
                  v-model="note"
                  class="form-control mb-2"
                  rows="2"
                  maxlength="300"
                  placeholder="e.g. The teacher sent proof that the class took place."
                ></textarea>
                <p v-if="settleError" class="text-danger small mb-2">{{ settleError }}</p>
                <div class="d-flex flex-wrap gap-2">
                  <button class="btn btn-sm btn-success" :disabled="settling" @click="settle(d, 'pay-teacher')">
                    Pay {{ d.teacherName }}
                  </button>
                  <button class="btn btn-sm btn-warning" :disabled="settling" @click="settle(d, 'refund-student')">
                    Refund {{ d.learnerName }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card custom-card mb-4">
          <div class="card-body">
            <h2 class="h5 mb-3">Recently settled bookings</h2>
            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Student</th>
                    <th>Teacher</th>
                    <th>Outcome</th>
                    <th>Note</th>
                    <th>Settled</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in disputes.settled" :key="d.bookingId">
                    <td>{{ d.title }}</td>
                    <td>{{ d.learnerName }}</td>
                    <td>{{ d.teacherName }}</td>
                    <td>{{ outcomeLabels[d.resolution] }}</td>
                    <td>{{ d.resolutionNote || '-' }}</td>
                    <td>{{ formatDate(d.resolvedAt) }}</td>
                  </tr>
                  <tr v-if="!loading && disputes.settled.length === 0">
                    <td colspan="6" class="text-center text-muted py-3">Nothing settled yet.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card custom-card">
          <div class="card-body">
            <h2 class="h5 mb-3">Resolved member reports</h2>
            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Title</th>
                    <th>About</th>
                    <th>Sent by</th>
                    <th>Reply</th>
                    <th>Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in resolvedMemberReports" :key="r.id">
                    <td>{{ reportTypeLabels[r.type] || r.type }}</td>
                    <td>{{ r.title }}</td>
                    <td>{{ r.targetName || '-' }}</td>
                    <td>{{ r.reporterName || '-' }}</td>
                    <td>{{ r.adminNote || '-' }}</td>
                    <td>{{ formatDate(r.updatedAt) }}</td>
                  </tr>
                  <tr v-if="!loading && resolvedMemberReports.length === 0">
                    <td colspan="6" class="text-center text-muted py-3">Nothing resolved yet.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Message reports ===== -->
      <AdminMessageReports v-if="tab === 'messages'" :reports="messageReports" :loading="loading" @changed="loadAll" />
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
}

.page-title {
  color: var(--k-text);
  font-weight: 700;
}

.min-w-0 {
  min-width: 0;
}

.custom-card {
  border: none;
  border-radius: 20px;
  background: white;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.08);
}

.stat-card {
  height: 100%;
  background: white;
  border-radius: 20px;
  padding: 1.5rem;
  text-align: center;
  box-shadow: 0 3px 15px rgba(0, 0, 0, 0.08);
}

.stat-label {
  font-size: 1rem;
  color: var(--k-muted);
}

.stat-value {
  margin: 0;
  font-size: 1.75rem;
  color: var(--k-brand);
  font-weight: bold;
}

/* ---------- The section buttons ---------- */
.admin-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border: 1px solid var(--k-border);
  border-radius: 999px;
  background: var(--k-surface-alt); /* light brown, the same as the table headings */
  color: var(--k-accent);
  font-weight: 600;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.admin-tab:hover {
  border-color: var(--k-brand);
}

.admin-tab:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--k-brand-soft), 0 0 0 5px var(--k-brand);
}

.admin-tab.active {
  background: var(--k-accent); /* dark brown */
  border-color: var(--k-accent);
  color: var(--k-on-accent);
}

/* how many are waiting in that section */
.tab-count {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--k-danger);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

table th {
  background: var(--k-surface-alt);
  color: var(--k-text);
  white-space: nowrap;
}

.report-warning {
  background-color: #fff8dd !important;
}

.report-danger {
  background-color: #fde2e2 !important;
}

tbody tr:hover {
  background-color: var(--k-surface-alt);
}

.reporter-link {
  color: var(--k-brand);
  text-decoration: none;
  font-weight: 600;
}

.reporter-link:hover {
  color: var(--k-brand-hover);
  text-decoration: underline;
}

.chat-box {
  background: var(--k-bg);
  border: 1px solid var(--k-border);
  max-height: 260px;
  overflow-y: auto;
}

.chat-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.settle-box {
  background: var(--k-surface-alt);
}

.dispute:last-child {
  border-bottom: none !important;
}

/* ---------- Member reports ---------- */
.type-badge {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--k-surface-alt);
  border: 1px solid var(--k-border);
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

/* the same status colours as the Reports page */
.report-status {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  white-space: nowrap;
}

.report-open {
  background: var(--k-brand-soft);
  color: #6b4423;
}

.report-in-review {
  background: #fbe7a8;
  color: #6b5200;
}

.report-resolved {
  background: #dcebdf;
  color: #2f5d3d;
}

.quote {
  background: var(--k-bg);
  border: 1px solid var(--k-border);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* a phone gets smaller number boxes */
@media (max-width: 575.98px) {
  .stat-card {
    padding: 1rem 0.5rem;
  }

  .stat-value {
    font-size: 1.4rem;
  }
}
</style>
