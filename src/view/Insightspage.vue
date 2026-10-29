<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Chart from 'chart.js/auto'

const router = useRouter()

function goHome() {
  router.push('/home')
}

// Fake data for now 
// learners = people who want to learn the skill, teachers = people who teach it
const skillStats = ref([
  { skill: 'Python intro', category: 'Tech', learners: 24, teachers: 2 },
  { skill: 'Tennis', category: 'Sports', learners: 18, teachers: 3 },
  { skill: 'Guitar basics', category: 'Music', learners: 15, teachers: 1 },
  { skill: 'Photo editing', category: 'Creative', learners: 12, teachers: 2 },
  { skill: 'Excel basics', category: 'Tech', learners: 11, teachers: 3 },
  { skill: 'Videography', category: 'Creative', learners: 9, teachers: 1 },
  { skill: 'Basketball', category: 'Sports', learners: 8, teachers: 4 },
])

// Bookings made each week (for the line chart)
const weekLabels = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7', 'Wk 8']
const weeklyBookings = [3, 5, 4, 8, 11, 9, 14, 18]

// Same genre colours as the home page
const genres = ['Sports', 'Creative', 'Music', 'Tech']
const categoryColors = {
  Sports: '#d9822b',
  Creative: '#8e5ea2',
  Music: '#3b8ea5',
  Tech: '#4a7c59',
}

// ---------- Numbers worked out from the data ----------
const totalLearners = computed(() => skillStats.value.reduce((sum, s) => sum + s.learners, 0))

// The 5 skills with the most learners
const topSkills = computed(() => {
  const sorted = [...skillStats.value].sort((a, b) => b.learners - a.learners)
  return sorted.slice(0, 5)
})

// The longest bar is 100% wide, the others are shown relative to it
const maxLearners = computed(() => topSkills.value[0].learners)

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
  return best.genre
})

// Skills with the most learners for each teacher = where teachers are needed most
const gaps = computed(() => {
  const list = []
  for (const s of skillStats.value) {
    list.push({ ...s, ratio: s.learners / s.teachers })
  }
  list.sort((a, b) => b.ratio - a.ratio)
  return list.slice(0, 3)
})

// ---------- Invite a friend ----------
const inviteCode = 'KONGSI-A1B2C3'
const inviteLink = window.location.origin + '/signup?ref=' + inviteCode
const friendsJoined = 2
const creditsEarned = 2
const copied = ref(false)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteLink)
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

onMounted(() => {
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
      labels: weekLabels,
      datasets: [
        {
          label: 'Bookings',
          data: weeklyBookings,
          borderColor: '#b5835a',
          backgroundColor: 'rgba(181, 131, 90, 0.15)',
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  })
})

onUnmounted(() => {
  pieChart.destroy()
  lineChart.destroy()
})
</script>

<template>
  <nav class="navbar border-bottom px-3">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <span class="text-dark" role="button" @click="goHome">Back to home</span>
  </nav>

  <div class="container py-4">
    <div class="p-4 mb-4 rounded banner">
      <h1 class="h4 mb-1">Insights</h1>
      <p class="mb-0">See what people want to learn, and where teachers are needed most.</p>
    </div>

    <!-- Summary numbers -->
    <div class="row g-3 mb-4">
      <div class="col-12 col-md-4">
        <div class="card">
          <div class="card-body text-center">
            <div class="fs-2 fw-bold">{{ totalLearners }}</div>
            <small class="text-muted">learners looking for skills</small>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card">
          <div class="card-body text-center">
            <div class="fs-2 fw-bold">{{ topSkills[0].skill }}</div>
            <small class="text-muted">most wanted skill</small>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card">
          <div class="card-body text-center">
            <div class="fs-2 fw-bold">{{ topGenre }}</div>
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

            <div v-for="s in topSkills" :key="s.skill" class="mb-3">
              <div class="d-flex justify-content-between small mb-1">
                <span>{{ s.skill }}</span>
                <span class="text-muted">{{ s.learners }} learners</span>
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
        <h2 class="h5 mb-3">Bookings per week</h2>
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

            <div
              v-for="g in gaps"
              :key="g.skill"
              class="d-flex justify-content-between border-bottom py-2"
            >
              <span>{{ g.skill }}</span>
              <small class="text-muted">
                {{ g.learners }} learners, {{ g.teachers }}
                {{ g.teachers === 1 ? 'teacher' : 'teachers' }}
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
            <p class="text-muted small mb-3">
              You and your friend each get 1 credit when they finish their first session.
            </p>

            <input :value="inviteLink" type="text" class="form-control mb-2" readonly />
            <button class="btn btn-brand w-100 mb-3" @click="copyLink">
              {{ copied ? 'Copied!' : 'Copy invite link' }}
            </button>

            <small class="text-muted">
              Friends who joined: {{ friendsJoined }} · Credits earned: {{ creditsEarned }}
            </small>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.banner {
  background: #f5f0e1;
  color: #4a3f2a;
}

.btn-brand {
  background: #b5835a;
  border-color: #b5835a;
  color: white;
  font-weight: 600;
}

.btn-brand:hover {
  background: #9c6e48;
  border-color: #9c6e48;
  color: white;
}

/* The grey track behind each bar, and the coloured bar on top of it */
.bar-track {
  background: #eee;
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