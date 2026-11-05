<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { useProfileStore } from '../stores/profile'
import { useBookingsStore } from '../stores/bookings'
import NavBar from '../components/NavBar.vue'
import CancelNotices from '../components/CancelNotices.vue'

// The page you land on after logging in: a personal welcome, a short getting-started
// tutorial, and shortcuts to the main parts of the app.
const router = useRouter()
const profileStore = useProfileStore()
const bookingsStore = useBookingsStore()
const uid = ref('')

const credits = computed(() => profileStore.credits)

// "Bob" from "Bob Lim" ('' until the profile has a name)
const firstName = computed(() => {
  const name = profileStore.profile ? profileStore.profile.name || '' : ''
  return name.trim().split(' ')[0]
})

// "Good morning" / "Good afternoon" / "Good evening" by the clock on this device
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

// warnings an admin gave me (shown at the top of the page)
const warnings = computed(() => {
  const list = profileStore.profile ? profileStore.profile.warnings : []
  return Array.isArray(list) ? list : []
})

// bookings that are not over yet
const activeLearning = computed(() =>
  bookingsStore.learning.filter((b) => b.status !== 'finished' && b.status !== 'cancelled')
)
const activeTeaching = computed(() =>
  bookingsStore.teaching.filter((b) => b.status !== 'finished' && b.status !== 'cancelled')
)

onMounted(async () => {
  await auth.authStateReady() // the router guard already made sure someone is logged in
  if (!auth.currentUser) return
  uid.value = auth.currentUser.uid
  loadTutorialState()
  // only animate opening and closing from now on, so a tutorial saved as hidden does not
  // visibly fold shut as the page loads
  await nextTick()
  requestAnimationFrame(() => {
    animate.value = true
  })
  profileStore.fetchProfile()
  profileStore.fetchMyCourses()
  bookingsStore.fetchBookings()
})

// ---------- Tutorial ----------
// Each step is ticked off by itself once the app sees you have done it (e.g. you booked
// something). "Browse courses" cannot be seen that way, so it is ticked when you press its button.
// What you clicked and whether the tutorial is hidden is remembered in this browser, per account.
const visited = ref([]) // keys of steps whose button was pressed
const hidden = ref(false)
const animate = ref(false) // false while the page is still loading the saved state
const current = ref(0) // index of the step shown in the panel

function storageKey() {
  return 'kongsi-tutorial-' + uid.value
}

function loadTutorialState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || '{}')
    visited.value = Array.isArray(saved.visited) ? saved.visited : []
    hidden.value = saved.hidden === true
  } catch {
    // storage blocked or broken: just start the tutorial fresh
  }
}

function saveTutorialState() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ visited: visited.value, hidden: hidden.value }))
  } catch {
    // storage blocked: the tutorial still works, it just forgets on reload
  }
}

const hasProfile = computed(() => {
  const p = profileStore.profile
  if (!p) return false
  const skills = (p.skillsTeach || []).length + (p.skillsLearn || []).length
  return (p.name || '').trim() !== '' && skills > 0
})

const steps = computed(() => [
  {
    key: 'profile',
    icon: '🙋',
    title: 'Set up your profile',
    text: 'Add your name and the skills you can teach or want to learn. Other members see this when they look at your courses.',
    tip: 'A short bio helps learners feel comfortable booking with you.',
    action: 'Edit my profile',
    to: '/profile',
    done: hasProfile.value,
  },
  {
    key: 'browse',
    icon: '🗺️',
    title: 'Browse courses',
    text: 'Search by name, filter by genre and region, or sort by distance to find courses near you. Online classes are listed too.',
    tip: 'Pins on the map are coloured by genre. Click one to see its start times.',
    action: 'Browse courses',
    to: '/courses',
    done: visited.value.includes('browse') || bookingsStore.learning.length > 0,
  },
  {
    key: 'book',
    icon: '📅',
    title: 'Book your first session',
    text: 'Pick a start time and confirm. The credits are held, not spent, until you and your coach both mark the course finished.',
    tip: 'You can cancel for a full refund until 24 hours before the start, and move to another start time until 2 hours before.',
    action: 'Find something to book',
    to: '/courses',
    done: bookingsStore.learning.length > 0,
  },
  {
    key: 'teach',
    icon: '🎓',
    title: 'Teach a skill',
    text: 'Create a course with your available start times. Every finished course pays you its credits, which you can spend on learning.',
    tip: 'Running low on credits? Teaching is the way to earn more.',
    action: 'Create a course',
    to: '/teach/new',
    done: profileStore.myOffers.length > 0,
  },
  {
    key: 'finish',
    icon: '🏁',
    title: 'Track progress and finish',
    text: 'Chat with your coach or learner in My classes, write a short reflection after each stage, and mark the course finished when you are done.',
    tip: 'Your Insights page shows how much you have learned and taught over time.',
    action: 'Go to My classes',
    to: '/classes',
    done: bookingsStore.bookings.some((b) => b.status === 'finished'),
  },
])

const doneCount = computed(() => steps.value.filter((s) => s.done).length)
const allDone = computed(() => doneCount.value === steps.value.length)
const progress = computed(() => Math.round((doneCount.value / steps.value.length) * 100))
const step = computed(() => steps.value[current.value])

function goToStep(s) {
  if (!visited.value.includes(s.key)) {
    visited.value = [...visited.value, s.key]
    saveTutorialState()
  }
  router.push(s.to)
}

// open the first step that is not done yet
function jumpToNext() {
  const index = steps.value.findIndex((s) => !s.done)
  current.value = index === -1 ? 0 : index
}

function hideTutorial() {
  hidden.value = true
  saveTutorialState()
}

function showTutorial() {
  hidden.value = false
  saveTutorialState()
  jumpToNext()
}

function toggleTutorial() {
  if (hidden.value) showTutorial()
  else hideTutorial()
}

// ---------- Shortcuts ----------
const shortcuts = [
  { icon: '🔍', title: 'Browse Courses', text: 'Find something new to learn near you.', to: '/courses' },
  { icon: '📚', title: 'My Classes', text: 'Chats, progress and reflections.', to: '/classes' },
  { icon: '📈', title: 'Insights', text: 'Your learning and teaching over time.', to: '/insights' },
  { icon: '✏️', title: 'Teach a Skill', text: 'Share what you know and earn credits.', to: '/teach/new' },
]
</script>

<template>
  <NavBar />

  <div class="container py-4">
    <!-- e.g. "Your account has been suspended." for a banned person -->
    <div v-if="profileStore.error" class="alert alert-danger">{{ profileStore.error }}</div>

    <div v-if="warnings.length > 0" class="alert alert-warning">
      <strong>{{ warnings.length === 1 ? 'You have a warning' : 'You have ' + warnings.length + ' warnings' }} from the Kongsi team.</strong>
      <ul class="mb-0 mt-1">
        <li v-for="(w, i) in warnings" :key="i">{{ w.reason }}</li>
      </ul>
    </div>

    <!-- classes that were cancelled or moved (by a student, or by the teacher) -->
    <CancelNotices />

    <!-- Personal welcome -->
    <section class="welcome mb-4">
      <p class="eyebrow mb-2">{{ greeting }}</p>
      <h1 class="mb-2">Welcome{{ firstName ? ', ' + firstName : '' }}! 👋</h1>
      <p class="mb-3 text-muted">
        <template v-if="allDone">You're all set. Here's what's happening on your Kongsi today.</template>
        <template v-else>New here? The short tutorial below walks you through the basics.</template>
      </p>

      <div class="row g-2 stats">
        <div class="col-4">
          <div class="stat">
            <span class="stat-value">{{ credits }}</span>
            <span class="stat-label">time credit{{ credits === 1 ? '' : 's' }}</span>
          </div>
        </div>
        <div class="col-4">
          <RouterLink to="/classes" class="stat stat-link">
            <span class="stat-value">{{ activeLearning.length }}</span>
            <span class="stat-label">course{{ activeLearning.length === 1 ? '' : 's' }} learning</span>
          </RouterLink>
        </div>
        <div class="col-4">
          <RouterLink to="/classes" class="stat stat-link">
            <span class="stat-value">{{ activeTeaching.length }}</span>
            <span class="stat-label">learner{{ activeTeaching.length === 1 ? '' : 's' }} to teach</span>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Getting-started tutorial. The header always shows; the steps fold open and shut.
         Once every step is done only the header and the "well done" message are left. -->
    <section class="k-card tutorial p-3 p-md-4 mb-4" aria-labelledby="tutorial-title">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div>
          <h2 id="tutorial-title" class="h4 mb-1">Getting started with Kongsi</h2>
          <p class="small text-muted mb-0">{{ doneCount }} of {{ steps.length }} steps done</p>
        </div>
        <button
          v-if="!allDone"
          type="button"
          class="tutorial-toggle"
          :aria-expanded="!hidden"
          aria-controls="tutorial-body"
          @click="toggleTutorial"
        >
          {{ hidden ? 'Show tutorial' : 'Hide tutorial' }}
          <span class="toggle-chevron" aria-hidden="true">▾</span>
        </button>
      </div>

      <div v-if="allDone" class="alert alert-success d-flex align-items-center gap-2 mt-3 mb-0">
        <span aria-hidden="true">🎉</span>
        <span>You've completed every step. You're a true Kongsi member now!</span>
      </div>

      <div
        v-else
        id="tutorial-body"
        class="collapser"
        :class="{ open: !hidden, animate: animate }"
        :inert="hidden || undefined"
      >
        <div class="collapser-inner">
          <div
            class="progress mt-3 mb-4"
            role="progressbar"
            :aria-valuenow="progress"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Tutorial progress"
          >
            <div class="progress-bar" :style="{ width: progress + '%' }"></div>
          </div>

          <div class="row g-3">
            <!-- The list of steps (a row that scrolls sideways on a phone) -->
            <div class="col-md-4">
              <ol class="step-list" role="tablist" aria-label="Tutorial steps">
                <li v-for="(s, i) in steps" :key="s.key">
                  <button
                    type="button"
                    role="tab"
                    class="step-tab"
                    :class="{ active: i === current, done: s.done }"
                    :aria-selected="i === current"
                    @click="current = i"
                  >
                    <span class="check" aria-hidden="true">{{ s.done ? '✓' : i + 1 }}</span>
                    <span class="step-title">{{ s.title }}</span>
                    <span v-if="s.done" class="visually-hidden">(done)</span>
                  </button>
                </li>
              </ol>
            </div>

            <!-- The step that is open -->
            <div class="col-md-8">
              <div class="step-panel h-100" role="tabpanel">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span class="step-icon" aria-hidden="true">{{ step.icon }}</span>
                  <span class="eyebrow">Step {{ current + 1 }} of {{ steps.length }}</span>
                  <span v-if="step.done" class="badge rounded-pill text-bg-success ms-auto">Done</span>
                </div>
                <h3 class="h5 mb-2">{{ step.title }}</h3>
                <p class="mb-3">{{ step.text }}</p>
                <p class="tip small mb-3"><strong>Tip:</strong> {{ step.tip }}</p>

                <div class="d-flex flex-wrap align-items-center gap-2">
                  <button type="button" class="btn btn-brand" @click="goToStep(step)">{{ step.action }}</button>
                  <div class="ms-auto d-flex gap-2">
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-secondary"
                      :disabled="current === 0"
                      @click="current--"
                    >&larr; Back</button>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-secondary"
                      :disabled="current === steps.length - 1"
                      @click="current++"
                    >Next &rarr;</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Shortcuts -->
    <h2 class="h5 mb-3">Jump back in</h2>
    <div class="row g-3">
      <div v-for="s in shortcuts" :key="s.to" class="col-6 col-lg-3">
        <RouterLink :to="s.to" class="k-card k-lift shortcut d-block h-100 p-3 text-decoration-none">
          <div class="shortcut-icon mb-2" aria-hidden="true">{{ s.icon }}</div>
          <div class="fw-semibold">{{ s.title }}</div>
          <div class="small text-muted">{{ s.text }}</div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  background: var(--k-surface-alt);
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius);
  padding: 2rem;
}

.welcome h1 {
  font-size: 2rem;
  color: var(--k-accent);
}

.stats {
  max-width: 560px;
}

.stat {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px 14px;
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  border-radius: 12px;
  color: var(--k-text);
  text-decoration: none;
}

.stat-link:hover {
  border-color: var(--k-brand);
}

.stat-value {
  font-family: var(--k-font-heading);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--k-accent);
}

.stat-label {
  font-size: 12px;
  color: var(--k-muted);
}

.tutorial h2 {
  color: var(--k-accent);
}

/* the pill that shows and hides the tutorial */
.tutorial-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 16px;
  border: 1px solid var(--k-border);
  border-radius: 999px;
  background: var(--k-surface-alt);
  color: var(--k-accent);
  font-size: 14px;
  font-weight: 600;
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.tutorial-toggle:hover {
  background: var(--k-brand-soft);
  border-color: var(--k-brand);
}

.tutorial-toggle:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--k-brand-soft);
  border-color: var(--k-brand);
}

.toggle-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--k-surface);
  font-size: 11px;
  transition: transform 0.3s ease;
}

.tutorial-toggle[aria-expanded='true'] .toggle-chevron {
  transform: rotate(180deg);
}

/* Folding the steps open and shut: the grid row grows from 0 to the content's own height,
   so the animation works whatever the height is. */
.collapser {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
}

.collapser.open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.collapser.animate {
  transition: grid-template-rows 0.35s ease, opacity 0.25s ease;
}

.collapser-inner {
  min-height: 0;
  overflow: hidden;
}

.progress {
  height: 8px;
  background: var(--k-surface-alt);
}

.progress-bar {
  background: var(--k-brand);
  transition: width 0.4s ease;
}

.step-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: none;
  color: var(--k-text);
  text-align: left;
  font-weight: 500;
}

.step-tab:hover {
  background: var(--k-surface-alt);
}

.step-tab.active {
  background: var(--k-surface-alt);
  border-color: var(--k-border);
  font-weight: 600;
}

.check {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--k-border);
  background: var(--k-surface);
  color: var(--k-muted);
  font-size: 13px;
  font-weight: 700;
}

.step-tab.active .check {
  border-color: var(--k-brand);
  color: var(--k-brand);
}

.step-tab.done .check {
  border-color: #2f7d4a;
  background: #2f7d4a;
  color: #fff;
}

.step-tab.done .step-title {
  color: var(--k-muted);
}

/* On a phone the steps sit in a row that scrolls sideways, showing only the numbers
   and the title of the open step. */
@media (max-width: 767.98px) {
  .step-list {
    flex-direction: row;
    overflow-x: auto;
  }

  .step-tab {
    width: auto;
  }

  .step-tab:not(.active) .step-title {
    display: none;
  }

  .step-title {
    white-space: nowrap;
  }
}

.step-panel {
  padding: 1.25rem;
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius);
  background: var(--k-bg);
}

.step-icon {
  font-size: 26px;
}

.tip {
  padding: 8px 12px;
  border-left: 3px solid var(--k-brand);
  background: var(--k-brand-soft);
  border-radius: 0 8px 8px 0;
  color: #6b4423;
}

.shortcut {
  color: var(--k-text);
}

.shortcut-icon {
  font-size: 24px;
}

@media (prefers-reduced-motion: reduce) {
  .progress-bar,
  .collapser.animate,
  .toggle-chevron {
    transition: none;
  }
}
</style>
