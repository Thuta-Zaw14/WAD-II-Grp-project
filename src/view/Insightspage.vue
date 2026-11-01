<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Chart from 'chart.js/auto'
import { auth } from '../firebase'
import { getInsights, errorText } from '../services/api'
import NavBar from '../components/NavBar.vue'
import LoadingText from '../components/LoadingText.vue'

const router = useRouter()


// ---------- Load the totals from the server ----------
// The server counts everybody's skills and bookings and sends back totals only.
const stats = ref(null) // null until loaded: { totalLearners, skills, weekly, invite }
const loading = ref(true)
const error = ref('')

// Same genre colours as the home page
const genres = ['Sports', 'Creative', 'Music', 'Tech']
const categoryColors = {
  Sports: '#d9822b',
  Creative: '#8e5ea2',
  Music: '#3b8ea5',
  Tech: '#4a7c59',
}

// learners = people who want to learn the skill, teachers = people who teach it
const skillStats = computed(() => (stats.value ? stats.value.skills : []))
const totalLearners = computed(() => (stats.value ? stats.value.totalLearners : 0))

// ---------- Numbers worked out from the data ----------
// The 5 skills with the most learners
const topSkills = computed(() => {
  const wanted = skillStats.value.filter((s) => s.learners > 0)
  return wanted.slice(0, 5) // the server already sorted them, most learners first
})

// The longest bar is 100% wide, the others are shown relative to it
const maxLearners = computed(() => (topSkills.value.length > 0 ? topSkills.value[0].learners : 1))

const mostWanted = computed(() => (topSkills.value.length > 0 ? topSkills.value[0].skill : '-'))

// Total learners for each genre
const genreTotals = computed(() => {
  const list = []
  for (const genre of genres) {
    let total = 0
    for (const s of skillStats.value) {
      if (s.category === genre) total += s.learners
    }
    list.push({ genre, total })
  }
  return list
})

const topGenre = computed(() => {
  let best = genreTotals.value[0]
  for (const g of genreTotals.value) {
    if (g.total > best.total) best = g
  }
  return best.total > 0 ? best.genre : '-'
})

// Skills with the most learners for each teacher = where teachers are needed most.
// A skill with no teacher yet counts as one teacher, so it is not divided by zero.
const gaps = computed(() => {
  const list = []
  for (const s of skillStats.value) {
    if (s.learners > 0) {
      list.push({ ...s, ratio: s.learners / Math.max(s.teachers, 1) })
    }
  }
  list.sort((a, b) => b.ratio - a.ratio || b.learners - a.learners)
  return list.slice(0, 3)
})

const bookingsTotal = computed(() => {
  let total = 0
  if (stats.value) {
    for (const count of stats.value.weekly.counts) total += count
  }
  return total
})

// ---------- Invite a friend ----------
const inviteLink = ref('')
const copied = ref(false)
const invite = computed(() => (stats.value ? stats.value.invite : null))

async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copied.value = true
  } catch (error) {
    console.error('Could not copy:', error.message)
  }
}

// ---------- Charts ----------
const pieEl = ref(null)
const lineEl = ref(null)
let pieChart = null
let lineChart = null

function drawCharts() {
  if (!stats.value || !pieEl.value || !lineEl.value) return // nothing loaded, or the page was left

  // Doughnut: learners per genre
  const labels = []
  const values = []
  const colors = []
  for (const g of genreTotals.value) {
    labels.push(g.genre)
    values.push(g.total)
    colors.push(categoryColors[g.genre])
  }

  pieChart = new Chart(pieEl.value, {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: colors }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  })

  // Line: bookings per week
  lineChart = new Chart(lineEl.value, {
    type: 'line',
    data: {
      labels: stats.value.weekly.labels,
      datasets: [
        {
          label: 'Bookings',
          data: stats.value.weekly.counts,
          borderColor: '#9a6a44', // --k-brand in theme.css
          backgroundColor: 'rgba(154, 106, 68, 0.15)',
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, // whole bookings only
    },
  })
}

onMounted(async () => {
  await auth.authStateReady() // wait until Firebase has restored the login
  if (!auth.currentUser) {
    router.push('/login')
    return
  }
  // the invite link carries my uid: a new person who signs up with it is linked to me
  inviteLink.value = window.location.origin + '/login?ref=' + auth.currentUser.uid

  try {
    stats.value = await getInsights()
  } catch (err) {
    error.value = 'Could not load the insights: ' + errorText(err)
  }
  loading.value = false
  drawCharts()
})

onUnmounted(() => {
  if (pieChart) pieChart.destroy()
  if (lineChart) lineChart.destroy()
})
</script>

<template>
  <NavBar />

  <div class="container py-4">
    <div class="p-4 mb-4 banner">
      <h1 class="h4 mb-1">Insights</h1>
      <p class="mb-0">See what people want to learn, and where teachers are needed most.</p>
    </div>

    <LoadingText v-if="loading" text="Loading the insights..." />
    <p v-else-if="error" class="text-danger">{{ error }}</p>

    <!-- Summary numbers -->
    <div class="row g-3 mb-4">
      <div class="col-12 col-md-4">
        <div class="card">
          <div class="card-body text-center">
            <div class="fs-2 fw-bold font-heading">{{ totalLearners }}</div>
            <small class="text-muted">people looking to learn a skill</small>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card">
          <div class="card-body text-center">
            <div class="fs-2 fw-bold font-heading">{{ mostWanted }}</div>
            <small class="text-muted">most wanted skill</small>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card">
          <div class="card-body text-center">
            <div class="fs-2 fw-bold font-heading">{{ topGenre }}</div>
            <small class="text-muted">top genre in demand</small>
          </div>
        </div>
      </div>
    </div>

    <!-- Top skills (bars) and genres (doughnut) -->
    <div class="row g-3 mb-4">
      <div class="col-lg-7">
        <div class="card h-100">
          <div class="card-body">
            <h2 class="h5 mb-3">Top skills in demand</h2>

            <p v-if="topSkills.length === 0" class="text-muted small mb-0">
              No data yet. Skills show up here once people add them under "Skills I want to learn".
            </p>

            <div v-for="s in topSkills" :key="s.skill" class="mb-3">
              <div class="d-flex justify-content-between small mb-1">
                <span>{{ s.skill }}</span>
                <span class="text-muted">{{ s.learners }} {{ s.learners === 1 ? 'learner' : 'learners' }}</span>
              </div>
              <div class="bar-track rounded">
                <div
                  class="bar-fill rounded"
                  :style="{
                    width: (s.learners / maxLearners) * 100 + '%',
                    background: categoryColors[s.category],
                  }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-5">
        <div class="card h-100">
          <div class="card-body">
            <h2 class="h5 mb-3">Demand by genre</h2>
            <p v-if="!loading && totalLearners === 0" class="text-muted small">No data yet.</p>
            <div class="chart-box">
              <canvas ref="pieEl"></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bookings over time (line) -->
    <div class="card mb-4">
      <div class="card-body">
        <h2 class="h5 mb-1">Bookings per week</h2>
        <p class="text-muted small mb-3">
          The last 8 weeks. Each point is one week, named after its first day.
          <span v-if="!loading && bookingsTotal === 0">No bookings yet.</span>
        </p>
        <div class="chart-box">
          <canvas ref="lineEl"></canvas>
        </div>
      </div>
    </div>

    <!-- Teacher gaps and invite -->
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-body">
            <h2 class="h5 mb-1">Teachers needed</h2>
            <p class="text-muted small mb-3">Skills with the most learners for each teacher.</p>

            <p v-if="gaps.length === 0" class="text-muted small">No data yet.</p>

            <div
              v-for="g in gaps"
              :key="g.skill"
              class="d-flex justify-content-between border-bottom py-2"
            >
              <span>{{ g.skill }}</span>
              <small class="text-muted">
                {{ g.learners }} {{ g.learners === 1 ? 'learner' : 'learners' }},
                {{ g.teachers === 0 ? 'no teachers yet' : g.teachers + (g.teachers === 1 ? ' teacher' : ' teachers') }}
              </small>
            </div>

            <p class="small text-muted mt-3 mb-0">
              Know someone who could teach one of these? Invite them and earn credits.
            </p>
          </div>
        </div>
      </div>

      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-body">
            <h2 class="h5 mb-1">Invite a friend</h2>
            <p v-if="invite" class="text-muted small mb-3">
              When a friend you invited finishes their first course, you earn
              {{ invite.rewardInviter }} credit{{ invite.rewardInviter === 1 ? '' : 's' }}.
              <template v-if="invite.rewardFriend > 0">
                They earn {{ invite.rewardFriend }} too.
              </template>
              This works for up to {{ invite.max }} friends.
            </p>

            <input :value="inviteLink" type="text" class="form-control mb-2" readonly />
            <button class="btn btn-brand w-100 mb-3" :disabled="inviteLink === ''" @click="copyLink">
              {{ copied ? 'Copied!' : 'Copy invite link' }}
            </button>

            <small v-if="invite" class="text-muted">
              Friends who joined: {{ invite.friendsJoined }} ·
              Friends rewarded: {{ invite.rewarded }} of {{ invite.max }} ·
              Credits earned: {{ invite.creditsEarned }}
            </small>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The grey track behind each bar, and the coloured bar on top of it */
.bar-track {
  background: var(--k-surface-alt);
  height: 12px;
}

.bar-fill {
  height: 12px;
}

/* Charts need a box with a set height to draw into */
.chart-box {
  position: relative;
  height: 260px;
}
</style>
