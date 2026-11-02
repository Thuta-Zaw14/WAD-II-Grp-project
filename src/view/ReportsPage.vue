<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { getMyReports, createReport, markReportSeen, errorText } from '../services/api'
import { useToastStore } from '../stores/toast'
import NavBar from '../components/NavBar.vue'
import LoadingText from '../components/LoadingText.vue'
import EmptyState from '../components/EmptyState.vue'

// Two screens on one page: the list of my reports (/reports), and the
// "File new report" form (/reports/new, where creating is true).
const props = defineProps({
  creating: { type: Boolean, default: false },
})

const router = useRouter()
const toast = useToastStore()

// The reports are kept here, not in a store: nobody else needs them, and this way
// they are gone as soon as someone logs out and leaves the page.
const reports = ref([])
const loading = ref(true)
const loadError = ref('')

async function loadReports() {
  loading.value = true
  loadError.value = ''
  try {
    reports.value = await getMyReports()
  } catch (err) {
    loadError.value = 'Could not load your reports: ' + errorText(err)
  }
  loading.value = false
}

onMounted(async () => {
  await auth.authStateReady() // wait until Firebase has restored the login
  if (!auth.currentUser) {
    router.push('/login')
    return
  }
  loadReports()
})

// ---------- How a report is shown ----------
const types = [
  { value: 'user', label: 'User-based' },
  { value: 'course', label: 'Course-based' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Others' },
]

function typeLabel(value) {
  const type = types.find((t) => t.value === value)
  return type ? type.label : value
}

const statusLabels = {
  open: 'Open',
  'in-review': 'Being looked at',
  resolved: 'Resolved',
}

// "2 Nov 2026, 8:30 pm" in Singapore time
function formatTime(iso) {
  return new Date(iso).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ---------- Opening a report ----------
const openId = ref('') // the report whose details are shown

async function toggle(report) {
  openId.value = openId.value === report.id ? '' : report.id
  if (openId.value === report.id && report.hasNews) {
    report.hasNews = false // take the "!" off straight away
    try {
      await markReportSeen(report.id)
    } catch (err) {
      console.log('Could not mark the report as seen:', errorText(err))
    }
  }
}

// ---------- File a new report ----------
const maxTitle = 100
const maxDescription = 1000
const form = reactive({ title: '', type: '', description: '' })
const formError = ref('')
const sending = ref(false)

function clearForm() {
  form.title = ''
  form.type = ''
  form.description = ''
  formError.value = ''
}

// the same page is used for the list and the form, so start a clean form each time it opens
watch(() => props.creating, clearForm)

async function submit() {
  formError.value = ''

  // quick checks so people get instant feedback (the server checks again)
  if (form.title.trim() === '') {
    formError.value = 'Please enter a title.'
    return
  }
  if (form.type === '') {
    formError.value = 'Please pick a type.'
    return
  }
  if (form.description.trim() === '') {
    formError.value = 'Please describe the problem.'
    return
  }

  sending.value = true
  try {
    const report = await createReport({
      title: form.title.trim(),
      type: form.type,
      description: form.description.trim(),
    })
    reports.value = [report, ...reports.value]
    toast.show('Report sent. An admin will look at it.')
    router.push('/reports')
  } catch (err) {
    formError.value = errorText(err)
  }
  sending.value = false
}
</script>

<template>
  <NavBar />

  <main class="container py-4 reports-page">
    <!-- ========== File a new report ========== -->
    <template v-if="creating">
      <a href="#" class="back-link small text-decoration-none" @click.prevent="router.push('/reports')">
        &lsaquo; Back to Reports
      </a>

      <section class="k-card form-card p-4 p-md-5 mt-3">
        <p class="eyebrow mb-1">TELL US WHAT HAPPENED</p>
        <h1 class="h4 mb-4">File a new report</h1>

        <form novalidate @submit.prevent="submit">
          <div class="mb-3">
            <label for="report-title" class="form-label">Report title</label>
            <input id="report-title" v-model="form.title" type="text" class="form-control" :maxlength="maxTitle" required />
          </div>

          <div class="mb-3">
            <label for="report-type" class="form-label">Type</label>
            <select id="report-type" v-model="form.type" class="form-select" required>
              <option value="" disabled>Pick a type</option>
              <option v-for="t in types" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>

          <div class="mb-3">
            <label for="report-description" class="form-label">Description</label>
            <textarea
              id="report-description"
              v-model="form.description"
              class="form-control"
              rows="6"
              :maxlength="maxDescription"
              placeholder="What went wrong? Include names, course titles or pages if they help."
              required
            ></textarea>
            <small class="text-muted">{{ form.description.length }}/{{ maxDescription }}</small>
          </div>

          <p v-if="formError" class="text-danger small fw-semibold" role="alert">{{ formError }}</p>

          <div class="d-flex justify-content-end gap-2 mt-4">
            <button type="button" class="btn btn-outline-secondary" @click="router.push('/reports')">Cancel</button>
            <button type="submit" class="btn btn-kongsi" :disabled="sending">
              {{ sending ? 'Sending...' : 'Submit' }}
            </button>
          </div>
        </form>
      </section>
    </template>

    <!-- ========== My reports ========== -->
    <template v-else>
      <div class="p-4 mb-4 banner">
        <h1 class="h4 mb-1">Reports</h1>
        <p class="mb-0">Tell us about a problem with a member, a course or the website, and follow what happens to it.</p>
      </div>

      <button type="button" class="new-report k-card w-100 mb-4" @click="router.push('/reports/new')">
        <span class="fw-semibold">File new report</span>
        <span class="plus" aria-hidden="true">+</span>
      </button>

      <LoadingText v-if="loading" text="Loading your reports..." />

      <div v-else-if="loadError" class="alert alert-danger d-flex justify-content-between align-items-center gap-3">
        <span>{{ loadError }}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" @click="loadReports">Try again</button>
      </div>

      <template v-else>
        <h2 v-if="reports.length > 0" class="h6 text-muted mb-3">Past reports, most recently updated first</h2>

        <article v-for="report in reports" :key="report.id" class="k-card report mb-3">
          <button
            type="button"
            class="report-head"
            :aria-expanded="openId === report.id ? 'true' : 'false'"
            :aria-controls="'report-' + report.id"
            @click="toggle(report)"
          >
            <span class="min-w-0">
              <strong class="d-block text-truncate">{{ report.title }}</strong>
              <small class="text-muted">{{ typeLabel(report.type) }} &middot; updated {{ formatTime(report.updatedAt) }}</small>
            </span>
            <span class="d-flex align-items-center gap-2 flex-shrink-0">
              <span class="report-status" :class="'report-' + report.status">{{ statusLabels[report.status] }}</span>
              <span v-if="report.hasNews" class="news-badge" title="There is an update on this report">
                !<span class="visually-hidden"> There is an update on this report</span>
              </span>
            </span>
          </button>

          <div v-if="openId === report.id" :id="'report-' + report.id" class="report-body">
            <p class="small text-muted mb-1">Sent {{ formatTime(report.createdAt) }}</p>
            <p class="description mb-3">{{ report.description }}</p>
            <div v-if="report.adminNote" class="admin-note">
              <p class="eyebrow mb-1">REPLY FROM AN ADMIN</p>
              <p class="mb-0">{{ report.adminNote }}</p>
            </div>
            <p v-else class="small text-muted mb-0">No reply yet. You'll see a "!" here when there's an update.</p>
          </div>
        </article>

        <EmptyState
          v-if="reports.length === 0"
          icon="📝"
          title="You haven't filed any reports."
          text="If something goes wrong, file a report and an admin will look at it."
        />
      </template>
    </template>
  </main>
</template>

<style scoped>
/* The colours, and the classes k-card, banner, btn-kongsi and eyebrow, come from src/assets/theme.css */
.reports-page {
  max-width: 860px;
  color: var(--k-text);
}

.back-link {
  color: var(--k-muted);
}

.form-card {
  max-width: 640px;
}

.min-w-0 {
  min-width: 0;
}

/* the big "File new report +" bar */
.new-report {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  color: var(--k-text);
  text-align: left;
}

.new-report:hover {
  background: var(--k-surface-alt);
}

.plus {
  font-size: 26px;
  line-height: 1;
  color: var(--k-brand);
}

.report {
  overflow: hidden;
}

.report-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 20px;
  border: 0;
  background: none;
  color: var(--k-text);
  text-align: left;
}

.report-head:hover {
  background: var(--k-surface-alt);
}

.report-body {
  padding: 4px 20px 18px;
  border-top: 1px solid var(--k-border);
  padding-top: 14px;
}

.description {
  white-space: pre-wrap;
}

.admin-note {
  padding: 12px;
  border-radius: 10px;
  background: var(--k-surface-alt);
}

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

/* the "!" when an admin changed the report since I last opened it */
.news-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--k-danger);
  color: #fff;
  font-weight: 700;
  font-size: 0.8rem;
}
</style>
