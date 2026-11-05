<script setup>
import { useBookingsStore } from '../stores/bookings'

// Tells people when a class was cancelled or moved, until they press "Got it". Shown on Home and
// My Classes.
//   As a teacher: a student cancelled (always refunded now; an older rule sometimes paid the
//   teacher instead) or moved their booking to another start time.
//   As a student: the teacher moved or cancelled the start time of a class I attend.
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
  <section v-if="store.notices.length > 0" class="mb-4" aria-label="Changes to your classes">
    <div v-for="b in store.notices" :key="b.id" class="cancel-notice" role="status">
      <div class="min-w-0">
        <!-- the teacher's notices -->
        <template v-if="b.notice.type === 'cancelled'">
          <p class="fw-semibold mb-1">{{ b.learnerName }} cancelled {{ b.title }}</p>
          <p class="small mb-0">
            It was starting {{ formatTime(b.startsAt) }}.
            <template v-if="b.refunded">
              <strong>{{ b.learnerName }} was refunded the {{ creditsText(b.creditCost) }}</strong>.
            </template>
            <template v-else>
              They cancelled less than 24 hours before the start, so
              <strong>you received the {{ creditsText(b.creditCost) }}</strong>.
            </template>
            Their seat is free again.
          </p>
        </template>

        <template v-else-if="b.notice.type === 'moved'">
          <p class="fw-semibold mb-1">{{ b.learnerName }} moved {{ b.title }}</p>
          <p class="small mb-0">
            From {{ formatTime(b.notice.from) }} to <strong>{{ formatTime(b.notice.to) }}</strong>.
          </p>
        </template>

        <!-- the student's notices -->
        <template v-else-if="b.notice.type === 'teacherMoved'">
          <p class="fw-semibold mb-1">{{ b.teacherName }} moved {{ b.title }}</p>
          <p class="small mb-1">
            It now starts <strong>{{ formatTime(b.notice.to) }}</strong> (it was {{ formatTime(b.notice.from) }}).
          </p>
          <p v-if="b.notice.note" class="small mb-1">{{ b.teacherName }} says: {{ b.notice.note }}</p>
          <p v-if="b.canCancel" class="small mb-0">
            If the new time doesn't suit you, you can cancel for a full refund until it starts (Details on My Classes).
          </p>
        </template>

        <template v-else-if="b.notice.type === 'teacherCancelled'">
          <p class="fw-semibold mb-1">{{ b.teacherName }} cancelled {{ b.title }}</p>
          <p class="small mb-1">
            It was starting {{ formatTime(b.startsAt) }}. <strong>You got your {{ creditsText(b.creditCost) }} back</strong>.
          </p>
          <p v-if="b.notice.note" class="small mb-0">Reason: {{ b.notice.note }}</p>
        </template>
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
