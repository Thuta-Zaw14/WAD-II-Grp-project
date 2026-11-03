<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAdminUser, banUser, unbanUser, warnUser, removeWarning, errorText } from '../services/api'
import LoadingText from '../components/LoadingText.vue'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const user = ref(null) // null until loaded
const loadError = ref('')

const showWarningForm = ref(false)
const warningReason = ref('')
const submitting = ref(false)
const actionError = ref('')

async function loadUser() {
  loadError.value = ''
  try {
    user.value = await getAdminUser(route.params.uid)
  } catch (err) {
    loadError.value = 'Could not load this user: ' + errorText(err)
  }
}

// "02/11/2026"
function formatDate(iso) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function viewUser(uid) {
  router.push('/admins/users/' + uid)
}

// Runs one action (ban, unban, warn, ...) and shows what happened in a toast.
// "work" is the function that talks to the server; it only runs after the person agreed.
async function doAction(work, successText) {
  if (submitting.value) return
  submitting.value = true
  actionError.value = ''
  try {
    await work()
    toast.show(successText)
  } catch (err) {
    actionError.value = errorText(err)
  }
  submitting.value = false
}

async function ban() {
  if (!window.confirm('Are you sure you want to ban this user? They will be logged out of every page.')) return
  await doAction(async () => {
    await banUser(user.value.id)
    user.value.isBanned = true
  }, 'User banned.')
}

async function unban() {
  if (!window.confirm('Are you sure you want to unban this user?')) return
  await doAction(async () => {
    await unbanUser(user.value.id)
    user.value.isBanned = false
  }, 'User unbanned.')
}

async function issueWarning() {
  const reason = warningReason.value.trim()
  if (reason === '') {
    actionError.value = 'Please enter a warning reason.'
    return
  }
  await doAction(async () => {
    const result = await warnUser(user.value.id, reason)
    user.value.warnings.push(result.warning)
    warningReason.value = ''
    showWarningForm.value = false
  }, 'Warning issued.')
}

async function takeBackWarning(index) {
  if (!window.confirm('Remove this warning?')) return
  await doAction(async () => {
    const result = await removeWarning(user.value.id, index)
    user.value.warnings = result.warnings
  }, 'Warning removed.')
}

onMounted(loadUser)
</script>

<template>
  <div class="profile-page">
    <div class="container py-4">
      <button class="btn back-btn mb-4" @click="router.push('/admins')">← Back to Dashboard</button>

      <h1 class="page-title mb-4">User Profile</h1>

      <div v-if="loadError" class="alert alert-danger">{{ loadError }}</div>
      <LoadingText v-else-if="!user" />

      <template v-if="user">
        <!-- User information and admin actions -->
        <div class="card custom-card mb-4">
          <div class="card-body">
            <h2 class="user-name mb-4">{{ user.name || '(no name yet)' }}</h2>

            <div class="row">
              <div class="col-md-6">
                <p><strong>Email:</strong> {{ user.email }}</p>
                <p><strong>User ID:</strong> {{ user.id }}</p>
                <p><strong>Credits:</strong> {{ user.credits }}</p>
                <p><strong>Joined:</strong> {{ formatDate(user.createdAt) }}</p>
              </div>

              <div class="col-md-6">
                <p><strong>Reports against them:</strong> {{ user.reports.length }}</p>
                <p>
                  <strong>Message reports they filed:</strong> {{ user.messageReportsFiled }}
                  ({{ user.messageReportsDismissed }} dismissed)
                </p>
                <p><strong>Warnings:</strong> {{ user.warnings.length }}</p>
                <p>
                  <strong>Status: </strong>
                  <span :class="user.isBanned ? 'status-banned' : 'status-active'">
                    {{ user.isBanned ? 'Banned' : 'Active' }}
                  </span>
                </p>
              </div>
            </div>

            <hr class="my-4" />

            <h4 class="section-title">Admin Actions</h4>
            <p class="text-muted">Manage this user's account and warnings.</p>

            <div v-if="actionError" class="alert alert-danger" role="alert">{{ actionError }}</div>

            <div class="d-flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-warning"
                :disabled="submitting"
                @click="showWarningForm = !showWarningForm; actionError = ''"
              >
                {{ showWarningForm ? 'Cancel Warning' : 'Warn User' }}
              </button>

              <button v-if="!user.isBanned" type="button" class="btn btn-danger" :disabled="submitting" @click="ban">
                {{ submitting ? 'Processing...' : 'Ban User' }}
              </button>
              <button v-else type="button" class="btn btn-success" :disabled="submitting" @click="unban">
                {{ submitting ? 'Processing...' : 'Unban User' }}
              </button>
            </div>

            <form v-if="showWarningForm" class="warning-form mt-4" @submit.prevent="issueWarning">
              <label for="warningReason" class="form-label fw-semibold">Warning Reason</label>
              <textarea
                id="warningReason"
                v-model="warningReason"
                class="form-control"
                rows="3"
                maxlength="500"
                placeholder="Please enter a warning reason..."
                required
              ></textarea>
              <div class="form-text">The person sees this on their home page.</div>

              <button type="submit" class="btn submit-warning-btn mt-3" :disabled="submitting || !warningReason.trim()">
                {{ submitting ? 'Submitting...' : 'Submit Warning' }}
              </button>
            </form>
          </div>
        </div>

        <!-- Skills -->
        <div class="card custom-card mb-4">
          <div class="card-body">
            <h4 class="section-title">Skills Teaching</h4>
            <div class="mb-3">
              <span v-for="skill in user.skillsTeach" :key="skill" class="skill-badge teach">{{ skill }}</span>
              <span v-if="user.skillsTeach.length === 0" class="text-muted">None listed.</span>
            </div>

            <h4 class="section-title">Skills Learning</h4>
            <div>
              <span v-for="skill in user.skillsLearn" :key="skill" class="skill-badge learn">{{ skill }}</span>
              <span v-if="user.skillsLearn.length === 0" class="text-muted">None listed.</span>
            </div>
          </div>
        </div>

        <!-- Warning history -->
        <div class="card custom-card mb-4">
          <div class="card-body">
            <h4 class="section-title">Warning History</h4>

            <div class="table-responsive">
              <table class="table align-middle">
                <thead>
                  <tr>
                    <th>Warning</th>
                    <th>Date Issued</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(warning, index) in user.warnings" :key="warning.createdAt + index">
                    <td>{{ warning.reason }}</td>
                    <td>{{ formatDate(warning.createdAt) }}</td>
                    <td class="text-end">
                      <button class="btn btn-outline-secondary btn-sm" :disabled="submitting" @click="takeBackWarning(index)">
                        Remove
                      </button>
                    </td>
                  </tr>
                  <tr v-if="user.warnings.length === 0">
                    <td colspan="3" class="text-center text-muted py-4">No warnings issued to this user.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Report history: bookings where the OTHER person pressed "Report a problem",
             and messages of this person that somebody reported -->
        <div class="card custom-card mb-4">
          <div class="card-body">
            <h4 class="section-title">Report History</h4>

            <div class="table-responsive">
              <table class="table align-middle">
                <thead>
                  <tr>
                    <th>Reporter</th>
                    <th>Course</th>
                    <th>Reason</th>
                    <th>Date</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="report in user.reports" :key="report.key">
                    <td>
                      <button class="btn btn-link p-0 reporter-link" @click="viewUser(report.reporterUid)">
                        {{ report.reporterName || 'Unknown' }}
                      </button>
                      <span v-if="report.reporterRole" class="text-muted small">({{ report.reporterRole }})</span>
                    </td>
                    <td>
                      {{ report.title }}
                      <div class="small text-muted">{{ report.what }}</div>
                    </td>
                    <td>{{ report.reason }}</td>
                    <td>{{ formatDate(report.reportedAt) }}</td>
                    <td>
                      {{ report.outcome }}
                      <div v-if="report.outcomeNote" class="small text-muted">{{ report.outcomeNote }}</div>
                    </td>
                  </tr>
                  <tr v-if="user.reports.length === 0">
                    <td colspan="5" class="text-center text-muted py-4">No reports submitted against this user.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  min-height: 100vh;
}

.page-title {
  color: var(--k-text);
  font-weight: 700;
}

.user-name {
  color: var(--k-text);
}

.custom-card {
  border: none;
  border-radius: 20px;
  background: white;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.08);
}

.section-title {
  color: var(--k-text);
  font-weight: 600;
  margin-bottom: 1rem;
}

.back-btn {
  background: var(--k-brand);
  color: white;
  border: none;
}

.back-btn:hover {
  background: var(--k-brand-hover);
  color: white;
}

.skill-badge {
  margin-right: 8px;
  margin-bottom: 8px;
  padding: 6px 12px;
  border-radius: 15px;
  display: inline-block;
}

.teach {
  background: var(--k-brand);
  color: white;
}

.learn {
  background: var(--k-surface-alt);
  color: var(--k-text);
}

.status-active {
  color: green;
  font-weight: bold;
}

.status-banned {
  color: #dc3545;
  font-weight: bold;
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

.warning-form {
  max-width: 600px;
}

.submit-warning-btn {
  background: var(--k-text);
  color: white;
  border: none;
}

.submit-warning-btn:hover {
  background: var(--k-accent-hover);
  color: white;
}

table th {
  background: var(--k-surface-alt);
  color: var(--k-text);
}
</style>
