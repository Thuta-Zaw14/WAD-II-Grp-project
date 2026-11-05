<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import LoadingText from '@/components/LoadingText.vue'
import EmptyState from '@/components/EmptyState.vue'
import AssignmentCard from '@/components/progress/AssignmentCard.vue'
import MasteryPath from '@/components/progress/MasteryPath.vue'
import BadgeShelf from '@/components/progress/BadgeShelf.vue'
import AssignmentFormModal from '@/components/progress/AssignmentFormModal.vue'
import MasteryGradeModal from '@/components/progress/MasteryGradeModal.vue'
import { useProgressStore } from '@/stores/progress'
import { useProfileStore } from '@/stores/profile'
import { useToastStore } from '@/stores/toast'
import {
  learnerStatus, needsAction, onTimeStreak, averageStars, courseJourney, masteryOf, MASTERY_INFO,
  badgesFor, learnerStats, timeLeftText, formatDue,
} from '@/services/progressRules'

// The Progress page: homework after a class, feedback on it, and how far each skill has come.
//   Learning tab - the homework I have to do, my journey in each skill, and my badges
//   Teaching tab - work waiting for my review, and per course: my assignments and my students
const route = useRoute()
const router = useRouter()
const store = useProgressStore()
const profileStore = useProfileStore()
const toast = useToastStore()

// the clock the countdowns use: ticks every minute
const now = ref(new Date())
let clock = null
onMounted(() => {
  store.fetchOverview()
  clock = setInterval(() => {
    now.value = new Date()
  }, 60 * 1000)
})
onUnmounted(() => clearInterval(clock))

// ---------- tabs (kept in the address, so a refresh or the back button stays on the same tab) ----------
const isTeacher = computed(() => store.teaching.courses.length > 0)
const tab = computed(() => (route.query.tab === 'teaching' && isTeacher.value ? 'teaching' : 'learning'))
function openTab(name) {
  router.replace({ query: name === 'learning' ? {} : { tab: name } })
}

// ---------- Learning ----------
const assignments = computed(() => store.learning.assignments)
const withStatus = computed(() => assignments.value.map((a) => ({ ...a, status: learnerStatus(a, now.value) })))
const toDo = computed(() => withStatus.value.filter((a) => needsAction(a.status)))
const past = computed(() =>
  withStatus.value
    .filter((a) => !needsAction(a.status))
    .sort((a, b) => (a.dueAt < b.dueAt ? 1 : -1))
)
const showAllPast = ref(false)
const pastShown = computed(() => (showAllPast.value ? past.value : past.value.slice(0, 6)))

const streak = computed(() => onTimeStreak(assignments.value, now.value))
const stars = computed(() => averageStars(assignments.value))
const courses = computed(() =>
  store.learning.courses.map((course) => {
    const own = assignments.value.filter((a) => a.offerId === course.offerId)
    const level = masteryOf(course)
    return { ...course, journey: courseJourney(course, own, now.value), level, homeworkCount: own.length }
  })
)
const masteredCount = computed(() => courses.value.filter((c) => c.level === 'mastered').length)
const badges = computed(() => badgesFor(learnerStats(assignments.value, store.learning.courses, now.value)))

// ---------- Teaching ----------
const teachingCourses = computed(() => store.teaching.courses)
const toReview = computed(() => store.teaching.toReview)
const studentCount = computed(() => new Set(teachingCourses.value.flatMap((c) => c.students.map((s) => s.uid))).size)
const assignmentCount = computed(() => teachingCourses.value.reduce((sum, c) => sum + c.assignments.length, 0))
const gradedCount = computed(() =>
  teachingCourses.value.reduce((sum, c) => sum + c.students.filter((s) => s.mastery).length, 0)
)

// the popups
const formFor = ref(null) // the course a new assignment is for
const gradeFor = ref(null) // { course, student }

async function onAssignmentSaved() {
  formFor.value = null
  toast.show('Assignment set. Your students can see it now.')
  await store.fetchOverview()
}

async function onMasterySaved(result) {
  const name = gradeFor.value.student.name
  gradeFor.value = null
  toast.show(
    result.bonusCredits > 0
      ? 'Saved. ' + name + ' earned the mastery bonus (+' + result.bonusCredits + ' credit)!'
      : 'Mastery grade saved. It is on ' + name + "'s skill card now."
  )
  await store.fetchOverview()
}

function percent(part, whole) {
  return whole === 0 ? 0 : Math.round((part / whole) * 100)
}

function initials(name) {
  const words = (name || '?').trim().split(/\s+/)
  return ((words[0] || '?')[0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

function sentAgo(at) {
  return timeLeftText(at, now.value).replace('Closed ', 'Sent ').replace('Due in ', 'Sent ')
}

const firstName = computed(() => ((profileStore.profile && profileStore.profile.name) || '').split(' ')[0])
</script>

<template>
  <NavBar />

  <main class="container py-4 progress-page">
    <header class="banner p-4 mb-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
      <div>
        <p class="eyebrow mb-1">PROGRESS</p>
        <h1 class="h3 mb-1">{{ firstName ? firstName + "'s progress" : 'Your progress' }}</h1>
        <p class="mb-0 text-muted">
          Practise after each class, send your instructor photos or videos, and work your way to mastery.
        </p>
      </div>
      <div v-if="isTeacher" class="tabs" role="tablist" aria-label="Progress views">
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ active: tab === 'learning' }"
          :aria-selected="tab === 'learning' ? 'true' : 'false'"
          aria-controls="learning-panel"
          data-testid="tab-learning"
          @click="openTab('learning')"
        >
          Learning
          <span v-if="store.overview && store.overview.counts.learning" class="tab-count">{{ store.overview.counts.learning }}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ active: tab === 'teaching' }"
          :aria-selected="tab === 'teaching' ? 'true' : 'false'"
          aria-controls="teaching-panel"
          data-testid="tab-teaching"
          @click="openTab('teaching')"
        >
          Teaching
          <span v-if="store.overview && store.overview.counts.teaching" class="tab-count">{{ store.overview.counts.teaching }}</span>
        </button>
      </div>
    </header>

    <div v-if="store.error" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
      {{ store.error }}
      <button type="button" class="btn btn-sm btn-outline-danger" @click="store.fetchOverview()">Try again</button>
    </div>
    <LoadingText v-else-if="store.loading && !store.overview" text="Loading your progress..." />

    <!-- ===================== LEARNING ===================== -->
    <div v-if="store.overview && tab === 'learning'" id="learning-panel" role="tabpanel" data-testid="learning-panel">
      <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
          <div class="k-card stat p-3 h-100" data-testid="stat-todo">
            <span class="stat-icon" aria-hidden="true">📝</span>
            <span class="stat-value">{{ toDo.length }}</span>
            <span class="stat-label">to do</span>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="k-card stat p-3 h-100" data-testid="stat-streak">
            <span class="stat-icon" aria-hidden="true">🔥</span>
            <span class="stat-value">{{ streak.current }}</span>
            <span class="stat-label">on-time streak<span v-if="streak.best > streak.current"> · best {{ streak.best }}</span></span>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="k-card stat p-3 h-100">
            <span class="stat-icon" aria-hidden="true">⭐</span>
            <span class="stat-value">{{ stars || '–' }}</span>
            <span class="stat-label">average stars</span>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="k-card stat p-3 h-100">
            <span class="stat-icon" aria-hidden="true">🏆</span>
            <span class="stat-value">{{ masteredCount }}</span>
            <span class="stat-label">skills mastered</span>
          </div>
        </div>
      </div>

      <aside class="bonus k-card p-3 mb-4 d-flex align-items-center gap-3">
        <span class="bonus-icon" aria-hidden="true">🎁</span>
        <p class="mb-0 small">
          <strong>Mastery bonus:</strong> hand in every assignment of a course on time and reach
          <strong>Mastered</strong> to earn <strong>+1 time credit</strong> (once per skill, up to 3 skills).
          Mastered skills show a 🏆 on your skill card, and you can start teaching them.
        </p>
      </aside>

      <section class="mb-5" aria-labelledby="todo-title">
        <h2 id="todo-title" class="h5 mb-3">To do <span class="text-muted fw-normal">({{ toDo.length }})</span></h2>
        <EmptyState
          v-if="toDo.length === 0"
          icon="🎉"
          title="You're all caught up"
          :text="assignments.length ? 'New homework from your instructors will show up here.' : 'After a class, your instructor can set homework here. Book a course to get started.'"
        >
          <RouterLink v-if="!assignments.length" to="/courses" class="btn btn-sm btn-brand">Browse courses</RouterLink>
        </EmptyState>
        <div v-else class="row g-3">
          <div v-for="assignment in toDo" :key="assignment.id" class="col-12 col-md-6 col-xl-4">
            <AssignmentCard :assignment="assignment" :now="now" />
          </div>
        </div>
      </section>

      <section class="mb-5" aria-labelledby="journey-title">
        <h2 id="journey-title" class="h5 mb-1">Your skill journeys</h2>
        <p class="small text-muted mb-3">Every course you have taken, from your first class to mastery.</p>
        <EmptyState v-if="courses.length === 0" icon="🌱" title="No skills yet" text="Your journey starts with your first class." />
        <div v-else class="row g-3">
          <div v-for="course in courses" :key="course.offerId" class="col-12 col-xl-6">
            <article class="k-card genre-card journey p-3 p-md-4 h-100" :class="'cat-' + (course.category || 'Other')" data-testid="journey-card">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
                <div class="min-w-0">
                  <p class="eyebrow mb-1">{{ course.skill || course.category }}</p>
                  <h3 class="h6 mb-0 text-break">{{ course.title }}</h3>
                  <p class="small text-muted mb-0">with {{ course.teacherName }}</p>
                </div>
                <span v-if="course.level" class="level-chip" :class="'level-' + course.level" data-testid="journey-level">
                  {{ MASTERY_INFO[course.level].icon }} {{ MASTERY_INFO[course.level].label }}
                </span>
              </div>

              <MasteryPath :steps="course.journey.steps" />

              <blockquote v-if="course.mastery && course.mastery.summary" class="summary small mt-3 mb-0">
                “{{ course.mastery.summary }}” <span class="text-muted">– {{ course.teacherName }}</span>
              </blockquote>
              <p v-if="course.mastery && course.mastery.bonusCredits" class="small fw-semibold mt-2 mb-0 bonus-earned">
                🎁 You earned the mastery bonus: +{{ course.mastery.bonusCredits }} credit
              </p>

              <div v-if="course.level === 'mastered'" class="teach-it mt-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
                <span class="small">You've mastered {{ course.skill || 'this skill' }}. Teach it and earn credits!</span>
                <RouterLink to="/skills/teach" class="btn btn-sm btn-brand">Teach this skill</RouterLink>
              </div>
              <p v-else-if="!course.finished" class="small text-muted mt-3 mb-0">
                Next step: send your reflections in <RouterLink to="/classes">My Classes</RouterLink> to finish the course.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section class="mb-5" aria-labelledby="badges-title">
        <h2 id="badges-title" class="h5 mb-3">Badges</h2>
        <BadgeShelf :badges="badges" />
      </section>

      <section v-if="past.length" aria-labelledby="past-title">
        <h2 id="past-title" class="h5 mb-3">Sent and past homework <span class="text-muted fw-normal">({{ past.length }})</span></h2>
        <div class="row g-3">
          <div v-for="assignment in pastShown" :key="assignment.id" class="col-12 col-md-6 col-xl-4">
            <AssignmentCard :assignment="assignment" :now="now" />
          </div>
        </div>
        <button v-if="past.length > 6" type="button" class="btn btn-outline-secondary btn-sm mt-3" @click="showAllPast = !showAllPast">
          {{ showAllPast ? 'Show less' : 'Show all ' + past.length }}
        </button>
      </section>
    </div>

    <!-- ===================== TEACHING ===================== -->
    <div v-if="store.overview && tab === 'teaching'" id="teaching-panel" role="tabpanel" data-testid="teaching-panel">
      <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
          <div class="k-card stat p-3 h-100" data-testid="stat-review">
            <span class="stat-icon" aria-hidden="true">📥</span>
            <span class="stat-value">{{ toReview.length }}</span>
            <span class="stat-label">to review</span>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="k-card stat p-3 h-100">
            <span class="stat-icon" aria-hidden="true">🧑‍🎓</span>
            <span class="stat-value">{{ studentCount }}</span>
            <span class="stat-label">students</span>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="k-card stat p-3 h-100">
            <span class="stat-icon" aria-hidden="true">📝</span>
            <span class="stat-value">{{ assignmentCount }}</span>
            <span class="stat-label">assignments set</span>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="k-card stat p-3 h-100">
            <span class="stat-icon" aria-hidden="true">🏅</span>
            <span class="stat-value">{{ gradedCount }}</span>
            <span class="stat-label">mastery grades given</span>
          </div>
        </div>
      </div>

      <section class="mb-5" aria-labelledby="review-title">
        <h2 id="review-title" class="h5 mb-3">Waiting for your review <span class="text-muted fw-normal">({{ toReview.length }})</span></h2>
        <EmptyState v-if="toReview.length === 0" icon="✅" title="Nothing to review" text="When students send their work, it lands here." />
        <ul v-else class="list-unstyled k-card review-list mb-0" data-testid="review-inbox">
          <li v-for="item in toReview" :key="item.id" class="review-row d-flex align-items-center gap-3 p-3">
            <span class="avatar" aria-hidden="true">{{ initials(item.learnerName) }}</span>
            <div class="flex-grow-1 min-w-0">
              <div class="fw-semibold text-truncate">{{ item.learnerName }} · {{ item.assignmentTitle }}</div>
              <div class="small text-muted text-truncate">
                {{ item.courseTitle }} · {{ sentAgo(item.submittedAt) }}
                · {{ item.photoCount }} photo{{ item.photoCount === 1 ? '' : 's' }}<span v-if="item.linkCount">, {{ item.linkCount }} video{{ item.linkCount === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <RouterLink
              :to="{ path: '/progress/assignments/' + item.assignmentId, query: { student: item.learnerUid } }"
              class="btn btn-sm btn-brand flex-shrink-0"
              data-testid="review-open"
            >Review</RouterLink>
          </li>
        </ul>
      </section>

      <section aria-labelledby="courses-title">
        <h2 id="courses-title" class="h5 mb-3">Your courses</h2>
        <div class="d-grid gap-4">
          <article
            v-for="course in teachingCourses"
            :key="course.offerId"
            class="k-card genre-card p-3 p-md-4"
            :class="'cat-' + (course.category || 'Other')"
            data-testid="teaching-course"
          >
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div class="min-w-0">
                <p class="eyebrow mb-1">{{ course.skill || course.category }}</p>
                <h3 class="h5 mb-0 text-break">{{ course.title }}</h3>
                <p class="small text-muted mb-0">
                  {{ course.students.length }} student{{ course.students.length === 1 ? '' : 's' }} after class
                </p>
              </div>
              <button
                type="button"
                class="btn btn-brand btn-sm"
                :disabled="course.students.length === 0"
                :title="course.students.length === 0 ? 'Homework can be set once a student has had their class' : ''"
                data-testid="new-assignment"
                @click="formFor = course"
              >+ New assignment</button>
            </div>

            <div class="row g-4">
              <div class="col-12 col-lg-7">
                <h4 class="eyebrow mb-2">ASSIGNMENTS</h4>
                <p v-if="course.assignments.length === 0" class="small text-muted mb-0">
                  {{ course.students.length ? 'No homework yet. Set some practice to help your students master this skill.' : 'Homework can be set once a student has had their class.' }}
                </p>
                <ul class="list-unstyled mb-0 d-grid gap-2">
                  <li v-for="assignment in course.assignments" :key="assignment.id">
                    <RouterLink :to="'/progress/assignments/' + assignment.id" class="assignment-row" data-testid="teaching-assignment">
                      <div class="d-flex justify-content-between gap-2">
                        <span class="fw-semibold text-break">{{ assignment.title }}</span>
                        <span v-if="assignment.toReviewCount" class="status tone-warning flex-shrink-0">{{ assignment.toReviewCount }} to review</span>
                      </div>
                      <div class="small text-muted mb-1">
                        {{ new Date(assignment.dueAt) > now ? 'Due ' + formatDue(assignment.dueAt) : 'Closed ' + formatDue(assignment.dueAt) }}
                      </div>
                      <div class="d-flex align-items-center gap-2">
                        <div class="progress flex-grow-1" role="progressbar" :aria-valuenow="percent(assignment.submittedCount, assignment.learnerCount)" aria-valuemin="0" aria-valuemax="100" :aria-label="'Work received for ' + assignment.title">
                          <div class="progress-bar" :style="{ width: percent(assignment.submittedCount, assignment.learnerCount) + '%' }"></div>
                        </div>
                        <span class="small text-muted flex-shrink-0">{{ assignment.submittedCount }}/{{ assignment.learnerCount }} sent</span>
                      </div>
                    </RouterLink>
                  </li>
                </ul>
              </div>

              <div class="col-12 col-lg-5">
                <h4 class="eyebrow mb-2">STUDENTS &amp; MASTERY</h4>
                <p v-if="course.students.length === 0" class="small text-muted mb-0">No students have had their class yet.</p>
                <ul class="list-unstyled mb-0 d-grid gap-2">
                  <li v-for="student in course.students" :key="student.uid" class="student-row d-flex align-items-center gap-2" data-testid="teaching-student">
                    <span class="avatar avatar-sm" aria-hidden="true">{{ initials(student.name) }}</span>
                    <div class="flex-grow-1 min-w-0">
                      <div class="fw-semibold text-truncate small">{{ student.name }}</div>
                      <div v-if="student.mastery" class="tiny">{{ MASTERY_INFO[student.mastery.level].icon }} {{ MASTERY_INFO[student.mastery.level].label }}</div>
                      <div v-else class="tiny text-muted">{{ student.finished ? 'Course finished' : 'Class taken' }}</div>
                    </div>
                    <button
                      type="button"
                      class="btn btn-sm flex-shrink-0"
                      :class="student.mastery ? 'btn-outline-secondary' : 'btn-accent'"
                      :disabled="!student.finished"
                      :title="student.finished ? '' : 'Available once their course is finished'"
                      data-testid="grade-mastery"
                      @click="gradeFor = { course, student }"
                    >{{ student.mastery ? 'Change' : 'Final grade' }}</button>
                  </li>
                </ul>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <AssignmentFormModal
      v-if="formFor"
      :course="formFor"
      :students="formFor.students"
      @close="formFor = null"
      @saved="onAssignmentSaved"
    />
    <MasteryGradeModal
      v-if="gradeFor"
      :course="gradeFor.course"
      :student="gradeFor.student"
      @close="gradeFor = null"
      @saved="onMasterySaved"
    />
  </main>
</template>

<style scoped>
.min-w-0 {
  min-width: 0;
}

/* ---------- tabs ---------- */
.tabs {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: var(--k-surface);
  border: 1px solid var(--k-border);
}

.tab {
  border: none;
  background: none;
  padding: 8px 18px;
  border-radius: 999px;
  font-weight: 600;
  color: var(--k-muted);
  transition: background 0.2s ease, color 0.2s ease;
}

.tab.active {
  background: var(--k-accent);
  color: #fff;
}

.tab:focus-visible {
  outline: 3px solid rgba(154, 106, 68, 0.4);
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--k-danger);
  color: #fff;
  font-size: 11px;
}

/* ---------- the four numbers ---------- */
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-icon {
  font-size: 20px;
}

.stat-value {
  font-family: var(--k-font-heading);
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--k-accent);
}

.stat-label {
  font-size: 13px;
  color: var(--k-muted);
}

/* ---------- learning ---------- */
.bonus {
  background: linear-gradient(90deg, #fff4df 0%, var(--k-surface) 70%);
  border-color: #ecd3a8;
}

.bonus-icon {
  font-size: 28px;
}

.level-chip {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--k-surface-alt);
  white-space: nowrap;
}

.level-practising { background: #e6efe0; color: #3f6a35; }
.level-proficient { background: #d5e8d9; color: #2f5d3d; }
.level-mastered { background: #fbe7a8; color: #6b5200; }

.summary {
  padding: 10px 14px;
  border-left: 3px solid var(--k-brand);
  background: var(--k-surface-alt);
  border-radius: 0 10px 10px 0;
  font-style: italic;
}

.bonus-earned {
  color: #6b5200;
}

.teach-it {
  padding: 10px 14px;
  border-radius: 12px;
  background: #fff6e0;
  border: 1px solid #f0d9a6;
}

/* ---------- teaching ---------- */
.review-list {
  overflow: hidden;
}

.review-row + .review-row {
  border-top: 1px solid var(--k-border);
}

.avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-weight: 700;
  font-size: 14px;
}

.avatar-sm {
  width: 32px;
  height: 32px;
  font-size: 12px;
}

.assignment-row {
  display: block;
  padding: 12px 14px;
  border: 1px solid var(--k-border);
  border-radius: 12px;
  background: var(--k-surface);
  color: var(--k-text);
  text-decoration: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.assignment-row:hover,
.assignment-row:focus-visible {
  border-color: var(--k-brand);
  box-shadow: var(--k-shadow-lift);
}

.progress {
  height: 6px;
  background: var(--k-surface-alt);
}

.progress-bar {
  background: var(--k-brand);
}

.student-row {
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--k-surface-alt);
}

.tiny {
  font-size: 12px;
}

@media (max-width: 575.98px) {
  .tabs {
    width: 100%;
  }

  .tab {
    flex: 1;
  }

  .stat-value {
    font-size: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tab,
  .assignment-row {
    transition: none;
  }
}
</style>
