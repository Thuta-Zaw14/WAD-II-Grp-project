<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { getMyReports, createReport, markReportSeen, searchReportTargets, errorText } from '../services/api'
import { useToastStore } from '../stores/toast'
import { useReportsStore } from '../stores/reports'
import NavBar from '../components/NavBar.vue'
import LoadingText from '../components/LoadingText.vue'
import EmptyState from '../components/EmptyState.vue'

// Two screens on one page: the list of my reports (/reports), and the
// "File New Report" form (/reports/new, where creating is true).
const props = defineProps({
  creating: { type: Boolean, default: false },
})

const router = useRouter()
const reportsStore = useReportsStore() // the red number on "Report" in the nav bar
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
      reportsStore.refreshNews() // and the red number on "Report" in the nav bar
    } catch (err) {
      console.log('Could not mark the report as seen:', errorText(err))
    }
  }
}

// ---------- File a new report ----------
const maxTitle = 100
const maxDescription = 1000
// target: the member or course picked in the search box ({ id, name }), only for those two types
const form = reactive({ title: '', type: '', target: null, description: '' })
const sending = ref(false)

// The checks work like the forms under Profile (LearnSkillPage.vue): a field is checked when
// you leave it, everything is checked on Submit, and the summary lists what still needs fixing.
const fieldErrors = reactive({ title: '', type: '', target: '', description: '' })
const submitAttempted = ref(false)
const summaryError = ref('')

// the extra box under Type: who or what the report is about
const targetBox = computed(() => {
  if (form.type === 'user') {
    return { label: 'Member', placeholder: "Start typing the member's name", missing: 'Pick the member you are reporting from the list.' }
  }
  if (form.type === 'course') {
    return { label: 'Course', placeholder: 'Start typing the course title or teacher', missing: 'Pick the course you are reporting from the list.' }
  }
  return null
})

function validateTitle() {
  if (form.title.trim() === '') return 'Please enter a report title.'
  if (form.title.trim().length > maxTitle) return 'The title must be ' + maxTitle + ' characters or fewer.'
  return ''
}

function validateType() {
  return form.type === '' ? 'Please pick a type.' : ''
}

function validateTarget() {
  if (!targetBox.value) return ''
  return form.target ? '' : targetBox.value.missing
}

function validateDescription() {
  if (form.description.trim() === '') return 'Please describe the problem.'
  if (form.description.length > maxDescription) return 'The description must be ' + maxDescription + ' characters or fewer.'
  return ''
}

const checks = {
  title: { check: validateTitle, label: 'Report Title' },
  type: { check: validateType, label: 'Type' },
  target: { check: validateTarget, label: '' }, // 'Member' or 'Course', from targetBox
  description: { check: validateDescription, label: 'Description' },
}

// "Report title, Type and Description"
function listOf(names) {
  if (names.length <= 1) return names.join('')
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
}

function validateForm() {
  submitAttempted.value = true
  const invalidFields = []
  for (const field in checks) {
    fieldErrors[field] = checks[field].check()
    if (fieldErrors[field]) invalidFields.push(field === 'target' ? targetBox.value.label : checks[field].label)
  }
  summaryError.value = invalidFields.length ? 'Please correct these fields: ' + listOf(invalidFields) + '.' : ''
  return invalidFields.length === 0
}

function handleFieldChange(field) {
  fieldErrors[field] = checks[field].check()
  if (submitAttempted.value) validateForm()
  else summaryError.value = ''
}

// ---------- The member / course search box ----------
const search = reactive({ text: '', results: [], open: false, loading: false, active: -1, error: '' })
let searchTimer = null
let lastAsked = '' // only the answer to the newest search is shown

function resetSearch() {
  clearTimeout(searchTimer)
  form.target = null
  search.text = ''
  search.results = []
  search.open = false
  search.loading = false
  search.active = -1
  search.error = ''
}

// a different type needs a different search, so start again
function onTypeChange() {
  resetSearch()
  fieldErrors.target = ''
  handleFieldChange('type')
}

function onSearchInput() {
  form.target = null // typing again means nothing is picked any more
  search.active = -1
  search.error = ''
  clearTimeout(searchTimer)
  const typed = search.text.trim()
  if (typed.length < 2) {
    search.results = []
    search.open = false
    return
  }
  // wait until they stop typing for a moment before asking the server
  searchTimer = setTimeout(() => runSearch(typed), 250)
}

async function runSearch(typed) {
  lastAsked = typed
  search.loading = true
  search.open = true
  try {
    const results = await searchReportTargets(form.type, typed)
    if (typed !== lastAsked) return
    search.results = results
  } catch (err) {
    if (typed !== lastAsked) return
    search.results = []
    search.error = errorText(err)
  }
  search.loading = false
}

function pickTarget(result) {
  form.target = { id: result.id, name: result.name }
  search.text = result.name
  search.open = false
  search.active = -1
  handleFieldChange('target')
}

// arrow keys move through the list, Enter picks, Escape closes it
function onSearchKey(event) {
  if (!search.open || search.results.length === 0) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    search.active = (search.active + 1) % search.results.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    search.active = search.active <= 0 ? search.results.length - 1 : search.active - 1
  } else if (event.key === 'Enter' && search.active >= 0) {
    event.preventDefault()
    pickTarget(search.results[search.active])
  } else if (event.key === 'Escape') {
    search.open = false
  }
}

// leaving the box: close the list (after a moment, so a click on a result still counts)
function onSearchBlur() {
  setTimeout(() => {
    search.open = false
    handleFieldChange('target')
  }, 150)
}

function clearForm() {
  form.title = ''
  form.type = ''
  form.description = ''
  resetSearch()
  for (const field in fieldErrors) fieldErrors[field] = ''
  submitAttempted.value = false
  summaryError.value = ''
}

// the same page is used for the list and the form, so start a clean form each time it opens
watch(() => props.creating, clearForm)

async function submit() {
  if (!validateForm()) return // the server checks again too

  sending.value = true
  try {
    const report = await createReport({
      title: form.title.trim(),
      type: form.type,
      targetId: form.target ? form.target.id : '',
      description: form.description.trim(),
    })
    reports.value = [report, ...reports.value]
    toast.show('Report sent. An admin will look at it.')
    router.push('/reports')
  } catch (err) {
    summaryError.value = errorText(err)
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
        <h1 class="h4 mb-2">File New Report</h1>
        <p class="small text-muted mb-4">Fields marked <span class="required-marker" aria-hidden="true">*</span> are required.</p>

        <div v-if="summaryError" class="alert alert-danger" role="alert" aria-live="assertive">
          {{ summaryError }}
        </div>

        <form novalidate @submit.prevent="submit">
          <div class="mb-3">
            <label for="report-title" class="form-label">Report Title <span class="required-marker" aria-hidden="true">*</span></label>
            <input
              id="report-title"
              v-model="form.title"
              type="text"
              class="form-control"
              :class="{ 'is-invalid': fieldErrors.title }"
              :aria-invalid="!!fieldErrors.title"
              :aria-describedby="fieldErrors.title ? 'report-title-error' : undefined"
              :maxlength="maxTitle"
              required
              @blur="handleFieldChange('title')"
            />
            <div v-if="fieldErrors.title" id="report-title-error" class="invalid-feedback d-block">{{ fieldErrors.title }}</div>
          </div>

          <div class="mb-3">
            <label for="report-type" class="form-label">Type <span class="required-marker" aria-hidden="true">*</span></label>
            <select
              id="report-type"
              v-model="form.type"
              class="form-select"
              :class="{ 'is-invalid': fieldErrors.type }"
              :aria-invalid="!!fieldErrors.type"
              :aria-describedby="fieldErrors.type ? 'report-type-error' : undefined"
              required
              @change="onTypeChange"
              @blur="handleFieldChange('type')"
            >
              <option value="" disabled>Pick a type</option>
              <option v-for="t in types" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
            <div v-if="fieldErrors.type" id="report-type-error" class="invalid-feedback d-block">{{ fieldErrors.type }}</div>
          </div>

          <!-- only for User-based and Course-based reports: who or what it is about -->
          <div v-if="targetBox" class="mb-3 search-field">
            <label for="report-target" class="form-label">
              {{ targetBox.label }} <span class="required-marker" aria-hidden="true">*</span>
            </label>
            <input
              id="report-target"
              v-model="search.text"
              type="text"
              class="form-control"
              :class="{ 'is-invalid': fieldErrors.target, 'is-valid': form.target }"
              :placeholder="targetBox.placeholder"
              autocomplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="report-target-list"
              :aria-expanded="search.open ? 'true' : 'false'"
              :aria-activedescendant="search.active >= 0 ? 'report-target-' + search.active : undefined"
              :aria-invalid="!!fieldErrors.target"
              :aria-describedby="fieldErrors.target ? 'report-target-error' : 'report-target-help'"
              @input="onSearchInput"
              @keydown="onSearchKey"
              @blur="onSearchBlur"
            />
            <ul v-show="search.open" id="report-target-list" class="search-results" role="listbox">
              <li v-if="search.loading" class="search-note">Searching...</li>
              <li v-else-if="search.error" class="search-note text-danger">{{ search.error }}</li>
              <li v-else-if="search.results.length === 0" class="search-note">
                No {{ form.type === 'user' ? 'members' : 'ongoing courses' }} match "{{ search.text.trim() }}".
              </li>
              <li
                v-for="(result, index) in search.loading ? [] : search.results"
                :id="'report-target-' + index"
                :key="result.id"
                class="search-option"
                :class="{ active: index === search.active }"
                role="option"
                :aria-selected="index === search.active ? 'true' : 'false'"
                @mousedown.prevent="pickTarget(result)"
              >
                <span class="d-block">{{ result.name }}</span>
                <small v-if="result.detail" class="text-muted">{{ result.detail }}</small>
              </li>
            </ul>
            <div v-if="fieldErrors.target" id="report-target-error" class="invalid-feedback d-block">{{ fieldErrors.target }}</div>
            <small v-else id="report-target-help" class="text-muted">
              {{ form.type === 'user' ? 'Only existing members can be picked.' : 'Only courses that are still running can be picked.' }}
            </small>
          </div>

          <div class="mb-3">
            <label for="report-description" class="form-label">Description <span class="required-marker" aria-hidden="true">*</span></label>
            <textarea
              id="report-description"
              v-model="form.description"
              class="form-control"
              :class="{ 'is-invalid': fieldErrors.description }"
              :aria-invalid="!!fieldErrors.description"
              :aria-describedby="fieldErrors.description ? 'report-description-error' : undefined"
              rows="6"
              :maxlength="maxDescription"
              placeholder="What went wrong? Include dates, places or pages if they help."
              required
              @blur="handleFieldChange('description')"
            ></textarea>
            <div v-if="fieldErrors.description" id="report-description-error" class="invalid-feedback d-block">{{ fieldErrors.description }}</div>
            <small class="text-muted">{{ form.description.length }}/{{ maxDescription }}</small>
          </div>

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
        <span class="fw-semibold">File New Report</span>
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
              <small class="text-muted">{{ typeLabel(report.type) }}<template v-if="report.targetName">: {{ report.targetName }}</template> &middot; updated {{ formatTime(report.updatedAt) }}</small>
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

.required-marker {
  color: #dc3545;
  font-weight: 700;
}

/* the member / course search: the results drop down under the box */
.search-field {
  position: relative;
}

.search-results {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 10;
  max-height: 260px;
  overflow-y: auto;
  margin: 4px 0 0;
  padding: 4px;
  list-style: none;
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  border-radius: 10px;
  box-shadow: var(--k-shadow-lift);
}

.search-option {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.search-option:hover,
.search-option.active {
  background: var(--k-surface-alt);
}

.search-note {
  padding: 8px 10px;
  color: var(--k-muted);
  font-size: 0.875rem;
}

.min-w-0 {
  min-width: 0;
}

/* the big "File New Report +" bar */
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
