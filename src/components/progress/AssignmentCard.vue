<script setup>
import { computed } from 'vue'
import StarRating from './StarRating.vue'
import { learnerStatus, STATUS_INFO, timeLeftText, formatDue, needsAction } from '@/services/progressRules'

// One piece of homework, as a student sees it in their list: what it is, how long is left,
// where it stands, and the button to open it.
const props = defineProps({
  // { id, title, courseTitle, category, teacherName, dueAt, canSubmit, missed, submission }
  assignment: { type: Object, required: true },
  now: { type: Date, default: () => new Date() }, // the tests pass a fixed time
})

const status = computed(() => learnerStatus(props.assignment, props.now))
const info = computed(() => STATUS_INFO[status.value])
const submission = computed(() => props.assignment.submission)

const timeText = computed(() => {
  if (status.value === 'redo' && submission.value && submission.value.redoUntil) {
    return 'Redo ' + timeLeftText(submission.value.redoUntil, props.now).toLowerCase()
  }
  if (status.value === 'graded' || status.value === 'submitted') return 'Sent ' + formatDue(submission.value.submittedAt)
  return timeLeftText(props.assignment.dueAt, props.now)
})

const actionText = computed(() => {
  if (status.value === 'redo') return 'Redo work'
  if (needsAction(status.value)) return 'Submit work'
  if (status.value === 'submitted' && props.assignment.canSubmit) return 'View or edit'
  return 'View'
})
</script>

<template>
  <article
    class="k-card k-lift genre-card assignment-card h-100 d-flex flex-column p-3"
    :class="['cat-' + (assignment.category || 'Other'), { urgent: status === 'dueSoon' || status === 'redo' }]"
    data-testid="assignment-card"
  >
    <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
      <p class="eyebrow mb-0 text-truncate">{{ assignment.courseTitle || 'Homework' }}</p>
      <span class="status flex-shrink-0" :class="'tone-' + info.tone" data-testid="assignment-status">
        {{ info.label }}
      </span>
    </div>

    <h3 class="h6 mb-1 title">{{ assignment.title }}</h3>
    <p class="small text-muted mb-3">Set by {{ assignment.teacherName }}</p>

    <div class="mt-auto d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div class="small">
        <span class="due" :class="{ 'text-danger fw-semibold': status === 'dueSoon' || status === 'missed' }" data-testid="assignment-due">
          <span aria-hidden="true">⏰ </span>{{ timeText }}
        </span>
        <div v-if="status === 'graded'" class="mt-1">
          <StarRating :model-value="submission.stars" readonly size="sm" />
        </div>
        <div v-if="submission && submission.news" class="news mt-1" data-testid="assignment-news">● New feedback</div>
      </div>
      <RouterLink
        :to="'/progress/assignments/' + assignment.id"
        class="btn btn-sm"
        :class="needsAction(status) ? 'btn-brand' : 'btn-outline-secondary'"
        data-testid="assignment-action"
      >
        {{ actionText }}
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.assignment-card {
  min-height: 170px;
}

.title {
  overflow-wrap: anywhere;
}

.urgent {
  box-shadow: 0 0 0 2px #f1d27a, var(--k-shadow);
}

.news {
  color: var(--k-danger);
  font-weight: 600;
}
</style>
