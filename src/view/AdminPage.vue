<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { getAdminUsers, getDisputes, settleDispute, getDisputeMessages, getMessageReports, errorText } from '../services/api'
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

onMounted(loadAll)
</script>

<template>
  <div class="admin-page">
    <div class="d-lg-none">
      <div class="container py-5">
        <div class="alert alert-warning text-center">
          This admin dashboard is only available on desktop devices.
        </div>
      </div>
    </div>

    <div class="container py-4 d-none d-lg-block">
      <div class="d-flex justify-content-between align-items-center">
        <h1 class="page-title mb-4">Admin</h1>
        <button class="btn btn-danger btn-sm" @click="logout">Log Out</button>
      </div>

      <LoadingText v-if="loading" />
      <div v-if="error" class="alert alert-danger">{{ error }}</div>

      <div class="row mb-4">
        <div class="col-3">
          <div class="stat-card">
            <h6>Total Users</h6>
            <h3>{{ users.length }}</h3>
          </div>
        </div>
        <div class="col-3">
          <div class="stat-card">
            <h6>Total Reports</h6>
            <h3>{{ totalReports }}</h3>
          </div>
        </div>
        <div class="col-3">
          <div class="stat-card">
            <h6>Open Disputes</h6>
            <h3>{{ disputes.open.length }}</h3>
          </div>
        </div>
        <div class="col-3">
          <div class="stat-card">
            <h6>Banned Accounts</h6>
            <h3>{{ bannedUsers }}</h3>
          </div>
        </div>
      </div>

      <ul class="nav nav-pills mb-3">
        <li class="nav-item">
          <button class="nav-link" :class="{ active: tab === 'users' }" @click="tab = 'users'">Users</button>
        </li>
        <li class="nav-item">
          <button class="nav-link" :class="{ active: tab === 'disputes' }" @click="tab = 'disputes'">
            Disputes
            <span v-if="disputes.open.length > 0" class="badge text-bg-danger ms-1">{{ disputes.open.length }}</span>
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" :class="{ active: tab === 'messages' }" @click="tab = 'messages'">
            Message reports
            <span v-if="messageReports.open.length > 0" class="badge text-bg-danger ms-1">{{ messageReports.open.length }}</span>
          </button>
        </li>
      </ul>

      <!-- ===== Users ===== -->
      <div v-if="tab === 'users'" class="card custom-card">
        <div class="card-body">
          <table class="table align-middle">
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

      <!-- ===== Disputes ===== -->
      <div v-if="tab === 'disputes'">

        <div class="card custom-card mb-4">
          <div class="card-body">
            <h2 class="h5 mb-1">Waiting for a decision</h2>
            <p class="text-muted small mb-3">
              The credits of these bookings are on hold. Paying the teacher means the course
              happened. Refunding the student means it did not.
            </p>

            <p v-if="!loading && disputes.open.length === 0" class="text-muted mb-0">Nothing to settle. 🎉</p>

            <div v-for="d in disputes.open" :key="d.bookingId" class="dispute border-bottom py-3">
              <div class="d-flex justify-content-between align-items-start gap-3">
                <div>
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
                <div class="d-flex gap-2 flex-shrink-0">
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
                <div class="d-flex gap-2">
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

        <div class="card custom-card">
          <div class="card-body">
            <h2 class="h5 mb-3">Recently settled</h2>
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

      <!-- ===== Message reports ===== -->
      <AdminMessageReports v-if="tab === 'messages'" :reports="messageReports" :loading="loading" @changed="loadAll" />
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  background: var(--k-bg);
  min-height: 100vh;
}

.page-title {
  color: var(--k-text);
  font-weight: 700;
}

.custom-card {
  border: none;
  border-radius: 20px;
  background: white;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.08);
}

.stat-card {
  background: white;
  border-radius: 20px;
  padding: 1.5rem;
  text-align: center;
  box-shadow: 0 3px 15px rgba(0, 0, 0, 0.08);
}

.stat-card h6 {
  color: var(--k-muted);
}

.stat-card h3 {
  color: var(--k-brand);
  font-weight: bold;
}

.nav-pills .nav-link {
  color: var(--k-text);
}

.nav-pills .nav-link.active {
  background: var(--k-brand);
  color: white;
}

table th {
  background: var(--k-surface-alt);
  color: var(--k-text);
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
</style>
