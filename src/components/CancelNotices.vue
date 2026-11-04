<script setup>
import { useBookingsStore } from '../stores/bookings'

// Tells a teacher that a student cancelled one of their classes, and where the credits went:
// back to the student (more than 24 hours before the start) or to the teacher (later than that).
// Each notice stays until the teacher presses "Got it". Shown on Home and My Classes.
const store = useBookingsStore()

function creditsText(count) {
  return count + ' credit' + (count === 1 ? '' : 's')
}

// "Sat, 8 Nov, 14:00" in Singapore time
function formatTime(iso) {
  return new Date(iso).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <section v-if="store.cancelNotices.length > 0" class="mb-4" aria-label="Cancelled classes">
    <div v-for="b in store.cancelNotices" :key="b.id" class="cancel-notice" role="status">
      <div class="min-w-0">
        <p class="fw-semibold mb-1">
          {{ b.learnerName }} cancelled {{ b.title }}
        </p>
        <p class="small mb-0">
          <template v-if="b.droppedMidCourse">
            They dropped the course after completing {{ b.stagesCompletedWhenDropped }} of {{ b.totalStageCount }} stages, so
            <strong v-if="b.refunded">{{ b.learnerName }} was refunded the {{ creditsText(b.creditCost) }}</strong>
            <strong v-else>you received the {{ creditsText(b.creditCost) }}</strong>.
          </template>
          <template v-else>
          It was starting {{ formatTime(b.startsAt) }}.
          <template v-if="b.refunded">
            They cancelled more than 24 hours before the start, so
            <strong>{{ b.learnerName }} was refunded the {{ creditsText(b.creditCost) }}</strong>.
          </template>
          <template v-else>
            They cancelled less than 24 hours before the start, so
            <strong>you received the {{ creditsText(b.creditCost) }}</strong>.
          </template>
          </template>
          Their seat is free again.
        </p>
      </div>
      <button type="button" class="btn btn-sm btn-outline-secondary flex-shrink-0" @click="store.dismissNotice(b.id)">
        Got it
      </button>
    </div>
  </section>
</template>

<style scoped>
.cancel-notice {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 8px;
  border: 1px solid var(--k-border);
  border-left: 4px solid var(--k-brand);
  border-radius: 12px;
  background: var(--k-surface);
  color: var(--k-text);
}

.min-w-0 {
  min-width: 0;
}
</style>
