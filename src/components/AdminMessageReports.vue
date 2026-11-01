<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getMessageReportContext, handleMessageReport, errorText } from '../services/api'

// The "Message reports" tab of the admin page: reports on single messages, either a post in a
// course discussion or a message in a private chat. (Reports on a whole booking are in the
// Disputes tab.) The admin page loads the lists and gives them to this component as a prop.
const props = defineProps({
  reports: { type: Object, required: true }, // { open: [...], handled: [...] }
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['changed']) // after a decision the admin page loads the lists again

const router = useRouter()

function viewUser(uid) {
  router.push('/admins/users/' + uid)
}

// "02/11/2026"
function formatDate(iso) {
  if (!iso) return 'N/A'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// "8 Nov, 14:05" in Singapore time
function formatTime(iso) {
  return new Date(iso).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function kindText(report) {
  return report.kind === 'public' ? 'Discussion post' : 'Private chat'
}

function outcomeText(report) {
  if (report.outcome === 'dismissed') return 'Dismissed'
  const done = []
  if (report.removedMessage) done.push('message removed')
  if (report.warned) done.push('warned')
  if (report.banned) done.push('banned')
  return 'Action taken: ' + done.join(', ')
}

// ---------- The messages around a reported one ----------
const contextId = ref('') // the report whose messages are showing
const contextMessages = ref([])
const reportedN = ref(0)
const contextLoading = ref(false)
const contextError = ref('')

async function toggleContext(report) {
  if (contextId.value === report.id) {
    contextId.value = ''
    return
  }
  contextId.value = report.id
  contextMessages.value = []
  contextError.value = ''
  contextLoading.value = true
  try {
    const data = await getMessageReportContext(report.id)
    contextMessages.value = data.messages
    reportedN.value = data.reportedN
  } catch (err) {
    contextError.value = errorText(err)
  }
  contextLoading.value = false
}

// ---------- Deciding ----------
// Choosing a report opens a small panel under it. Ticking nothing dismisses the report.
const openId = ref('')
const removeMessage = ref(false)
const warnChecked = ref(false)
const warning = ref('')
const ban = ref(false)
const note = ref('')
const working = ref(false)
const error = ref('')
const message = ref('')

const anyChoice = computed(() => removeMessage.value || warnChecked.value || ban.value)

function openDecision(report) {
  openId.value = openId.value === report.id ? '' : report.id
  removeMessage.value = false
  warnChecked.value = false
  warning.value = ''
  ban.value = false
  note.value = ''
  error.value = ''
}

async function decide(report) {
  if (working.value) return
  if (warnChecked.value && warning.value.trim() === '') {
    error.value = 'Write the warning first.'
    return
  }

  const steps = []
  if (removeMessage.value) steps.push('remove the post')
  if (warnChecked.value) steps.push('warn ' + report.authorName)
  if (ban.value) steps.push('ban ' + report.authorName)
  const question =
    steps.length === 0
      ? 'Dismiss this report? Nothing will happen to ' + report.authorName + '.'
      : 'This will ' + steps.join(', ') + '. Continue?'
  if (!window.confirm(question)) return

  working.value = true
  error.value = ''
  message.value = ''
  try {
    await handleMessageReport(report.id, {
      removeMessage: removeMessage.value,
      warning: warnChecked.value ? warning.value : '',
      ban: ban.value,
      note: note.value,
    })
    message.value = steps.length === 0 ? 'Report dismissed.' : 'Done: ' + steps.join(', ') + '.'
    openId.value = ''
    if (contextId.value === report.id) contextId.value = ''
    emit('changed')
  } catch (err) {
    error.value = errorText(err)
  }
  working.value = false
}
</script>

<template>
  <div>
    <div v-if="message" class="alert alert-success" role="status">{{ message }}</div>

    <div class="card custom-card mb-4">
      <div class="card-body">
        <h2 class="h5 mb-1">Waiting for a decision</h2>
        <p class="text-muted small mb-3">
          People reported these single messages. Look at what was said around them, then remove the post, warn or
          ban the person who wrote it, or dismiss the report. A dismissed report does not count against anyone.
        </p>

        <p v-if="!loading && props.reports.open.length === 0" class="text-muted mb-0">Nothing to look at. 🎉</p>

        <div v-for="r in props.reports.open" :key="r.id" class="report border-bottom py-3">
          <div class="d-flex justify-content-between align-items-start gap-3">
            <div class="flex-grow-1">
              <span class="badge" :class="r.kind === 'public' ? 'text-bg-secondary' : 'text-bg-dark'">{{ kindText(r) }}</span>
              <strong class="ms-2">{{ r.title }}</strong>

              <div class="small mt-2">
                <button class="btn btn-link btn-sm p-0 reporter-link" @click="viewUser(r.authorUid)">{{ r.authorName || 'Unknown' }}</button>
                wrote on {{ formatTime(r.messageAt) }}:
              </div>
              <div class="quote p-2 rounded mt-1">{{ r.messageText }}</div>

              <div class="small mt-2">
                <button class="btn btn-link btn-sm p-0 reporter-link" @click="viewUser(r.reporterUid)">{{ r.reporterName || 'Unknown' }}</button>
                reported it on {{ formatDate(r.createdAt) }}: "{{ r.reason }}"
              </div>
            </div>

            <div class="d-flex gap-2 flex-shrink-0">
              <button class="btn btn-sm btn-outline-secondary" @click="toggleContext(r)">
                {{ contextId === r.id ? 'Hide context' : 'View context' }}
              </button>
              <button class="btn btn-sm btn-outline-dark" @click="openDecision(r)">
                {{ openId === r.id ? 'Close' : 'Decide' }}
              </button>
            </div>
          </div>

          <!-- what was said around it -->
          <div v-if="contextId === r.id" class="context-box mt-3 p-3 rounded">
            <p v-if="contextLoading" class="small text-muted mb-0">Loading...</p>
            <p v-else-if="contextError" class="small text-danger mb-0">{{ contextError }}</p>
            <p v-else-if="contextMessages.length === 0" class="small text-muted mb-0">
              Nothing to show (the course may have been deleted). The copy of the message above is what was reported.
            </p>
            <div v-for="m in contextMessages" :key="m.n" class="context-message mb-2 px-2 rounded" :class="{ reported: m.n === reportedN }">
              <span class="small text-muted">
                {{ m.authorName }}<span v-if="m.role === 'teacher'"> (teacher)</span><span v-else-if="m.role === 'learner'"> (student)</span>
                · {{ formatTime(m.createdAt) }}
                <span v-if="m.removed" class="badge text-bg-secondary ms-1">removed</span>
                <span v-if="m.n === reportedN" class="badge text-bg-danger ms-1">reported</span>
              </span>
              <div class="text">{{ m.text }}</div>
            </div>
          </div>

          <!-- the decision -->
          <div v-if="openId === r.id" class="decision-box mt-3 p-3 rounded">
            <p class="small fw-semibold mb-2">What should happen? Tick nothing to dismiss the report.</p>

            <div v-if="r.kind === 'public'" class="form-check mb-1">
              <input :id="'remove-' + r.id" v-model="removeMessage" class="form-check-input" type="checkbox" />
              <label :for="'remove-' + r.id" class="form-check-label small">Remove this post (nobody can read it any more)</label>
            </div>

            <div class="form-check mb-1">
              <input :id="'warn-' + r.id" v-model="warnChecked" class="form-check-input" type="checkbox" />
              <label :for="'warn-' + r.id" class="form-check-label small">Warn {{ r.authorName }}</label>
            </div>
            <textarea
              v-if="warnChecked"
              v-model="warning"
              class="form-control mb-2"
              rows="2"
              maxlength="500"
              :placeholder="'The warning ' + r.authorName + ' will see on their home page'"
              @input="error = ''"
            ></textarea>

            <div class="form-check mb-2">
              <input :id="'ban-' + r.id" v-model="ban" class="form-check-input" type="checkbox" />
              <label :for="'ban-' + r.id" class="form-check-label small">Ban {{ r.authorName }} (they are logged out of every page)</label>
            </div>

            <label :for="'note-' + r.id" class="form-label small fw-semibold">Note for the record (optional)</label>
            <textarea :id="'note-' + r.id" v-model="note" class="form-control mb-2" rows="2" maxlength="300"></textarea>

            <p v-if="error" class="text-danger small mb-2">{{ error }}</p>
            <button class="btn btn-sm" :class="anyChoice ? 'btn-danger' : 'btn-secondary'" :disabled="working" @click="decide(r)">
              {{ working ? 'Saving...' : anyChoice ? 'Apply' : 'Dismiss report' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card custom-card">
      <div class="card-body">
        <h2 class="h5 mb-3">Recently handled</h2>
        <table class="table align-middle mb-0">
          <thead>
            <tr>
              <th>Where</th>
              <th>Course</th>
              <th>Written by</th>
              <th>Reported by</th>
              <th>Outcome</th>
              <th>Note</th>
              <th>Handled</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in props.reports.handled" :key="r.id">
              <td>{{ kindText(r) }}</td>
              <td>{{ r.title }}</td>
              <td>{{ r.authorName }}</td>
              <td>{{ r.reporterName || '-' }}</td>
              <td>{{ outcomeText(r) }}</td>
              <td>{{ r.note || '-' }}</td>
              <td>{{ formatDate(r.handledAt) }}</td>
            </tr>
            <tr v-if="!loading && props.reports.handled.length === 0">
              <td colspan="7" class="text-center text-muted py-3">Nothing handled yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-card {
  border: none;
  border-radius: 20px;
  background: white;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.08);
}

table th {
  background: #e2ddd0;
  color: #4a3f35;
}

.reporter-link {
  color: #bb8860;
  text-decoration: none;
  font-weight: 600;
}

.reporter-link:hover {
  color: #a56f47;
  text-decoration: underline;
}

.quote {
  background: #fbf8f0;
  border-left: 4px solid #bb8860;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.context-box {
  background: #fbf8f0;
  border: 1px solid #e3d9bf;
  max-height: 260px;
  overflow-y: auto;
}

.context-message.reported {
  background: #fde2e2;
}

.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.decision-box {
  background: #f7f3ec;
}

.report:last-child {
  border-bottom: none !important;
}
</style>
