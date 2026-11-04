<script setup>
import { ref, computed } from 'vue'
import { useBookingsStore } from '../stores/bookings'

// The lesson times of one booking, for the student (Details) and the teacher (a student's popup).
// Every stage has its own lesson. Either person can suggest a time for the current stage's lesson
// (to book it, or to move it while it is more than 24 hours away); the other accepts, declines or
// suggests another time. The server checks every rule again (models/bookings.js).
//   showStages: also list every stage with its lesson time and when it was completed
//   mode: 'summary' (in Details / a student's popup: what is agreed, and the buttons) or
//         'form' (its own popup: the date and time picker). In summary, the buttons ask the page
//         to open the form ('propose') or the "cancel this session?" popup ('cancelSession').
const props = defineProps({
  booking: { type: Object, required: true },
  showStages: { type: Boolean, default: true },
  mode: { type: String, default: 'summary' },
})
const emit = defineEmits(['chat', 'propose', 'cancelSession', 'done'])
const store = useBookingsStore()

const NOTICE_HOURS = 24 // the same as SCHEDULE_NOTICE_HOURS on the server

const b = computed(() => props.booking)
const otherName = computed(() => (b.value.role === 'learner' ? b.value.teacherName : b.value.learnerName))
const busy = computed(() => store.busyId === b.value.id)

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

function stageName(index) {
  const stage = (b.value.stageProgress || [])[index]
  return 'Stage ' + (index + 1) + (stage ? ': ' + stage.stageName : '')
}

// the stage being worked on now (the first one not approved), or -1 when every stage is done
const currentStage = computed(() => (b.value.stageProgress || []).findIndex((stage) => !stage.approved))
const currentSessionAt = computed(() => {
  const stage = (b.value.stageProgress || [])[currentStage.value]
  return stage ? stage.sessionAt : ''
})

// "They accepted your time": kept from when this popup opened, because opening it marks the
// news seen straight away (so it would otherwise vanish while being read)
const agreed = ref(props.booking.timeAgreed || null)
const cancelledByOther = ref(props.booking.sessionCancelled || null) // the same for "they cancelled a session"

// a live suggestion (an expired one is only mentioned)
const proposal = computed(() => (b.value.proposal && !b.value.proposal.expired ? b.value.proposal : null))
const expiredProposal = computed(() => (b.value.proposal && b.value.proposal.expired ? b.value.proposal : null))

// ---------- Suggesting a time ----------
const formOpen = ref(false)
const date = ref('')
const time = ref('')
const note = ref('')
const formError = ref('')

// "2026-11-08" in Singapore time, at least NOTICE_HOURS from now (the earliest day that can work)
const minDate = computed(() => {
  const earliest = new Date(Date.now() + NOTICE_HOURS * 3600 * 1000 + 8 * 3600 * 1000)
  return earliest.toISOString().slice(0, 10)
})

// in the summary, the form opens in its own popup; in the form popup, it starts filled in
function openForm() {
  if (props.mode === 'summary') {
    emit('propose')
    return
  }
  formError.value = ''
  store.actionError = ''
  note.value = ''
  date.value = minDate.value
  // start from the agreed time of day, which is often the one people keep
  const agreed = currentSessionAt.value
  time.value = agreed ? new Date(new Date(agreed).getTime() + 8 * 3600 * 1000).toISOString().slice(11, 16) : ''
  formOpen.value = true
}

async function send() {
  formError.value = ''
  if (!date.value || !time.value) {
    formError.value = 'Pick a date and a time.'
    return
  }
  const startsAt = new Date(date.value + 'T' + time.value + ':00+08:00') // the date and time are Singapore time
  if (startsAt.getTime() - Date.now() < NOTICE_HOURS * 3600 * 1000) {
    formError.value = 'Pick a time at least ' + NOTICE_HOURS + ' hours from now.'
    return
  }
  if (await store.proposeTime(b.value.id, startsAt.toISOString(), note.value.trim())) {
    formOpen.value = false
    emit('done')
  }
}

if (props.mode === 'form') openForm()

function answer(accept) {
  formOpen.value = false
  store.answerTime(b.value.id, accept)
}

const scheduleButtonText = computed(() => (b.value.schedule && b.value.schedule.kind === 'book' ? 'Book Next Session' : 'Reschedule'))
</script>

<template>
  <div class="session-schedule">
    <!-- every stage: its lesson time, and when it was completed -->
    <template v-if="showStages">
      <h3 class="h6">Stages and sessions</h3>
      <ol class="stage-times">
        <li v-for="(stage, index) in b.stageProgress" :key="index" class="stage-time" :class="{ done: stage.approved }">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <strong class="min-w-0">{{ index + 1 }}. {{ stage.stageName }}</strong>
            <span v-if="stage.approved" class="pill pill-done">Completed</span>
            <span v-else-if="index === currentStage" class="pill pill-now">Current</span>
          </div>
          <div class="small text-muted">
            Session: {{ stage.sessionAt ? formatTime(stage.sessionAt) : 'not booked yet' }}
          </div>
          <div v-if="stage.submittedAt" class="small text-muted">Reflection sent: {{ formatTime(stage.submittedAt) }}</div>
          <div v-if="stage.approved && stage.approvedAt" class="small text-muted">Completed: {{ formatTime(stage.approvedAt) }}</div>
        </li>
      </ol>
    </template>

    <!-- the other person accepted the time I suggested -->
    <p v-if="mode === 'summary' && agreed" class="agreed-box mb-2" role="status">
      ✅ <strong>{{ otherName }}</strong> accepted your time for {{ stageName(agreed.stage) }}:
      <strong>{{ formatTime(agreed.startsAt) }}</strong>
      <span class="new-pill">New</span>
    </p>

    <!-- the other person cancelled a session -->
    <p v-if="mode === 'summary' && cancelledByOther" class="cancelled-box mb-2" role="status">
      ⚠️ <strong>{{ otherName }}</strong> cancelled the {{ stageName(cancelledByOther.stage) }} session
      <template v-if="cancelledByOther.sessionAt">({{ formatTime(cancelledByOther.sessionAt) }})</template>.
      <template v-if="cancelledByOther.penalty">It was their second cancellation, so 1 credit came to you.</template>
      Please agree on a new time.
      <span class="new-pill">New</span>
    </p>

    <template v-if="mode === 'summary' && b.status === 'booked' && currentStage !== -1">
      <!-- the other person suggested a time: my turn -->
      <div v-if="proposal && !proposal.fromMe" class="proposal-box mb-2">
        <p class="mb-1">
          <strong>{{ otherName }}</strong> suggested <strong>{{ formatTime(proposal.startsAt) }}</strong>
          for {{ stageName(proposal.stage) }}<template v-if="currentSessionAt">, instead of {{ formatTime(currentSessionAt) }}</template>.
        </p>
        <p v-if="proposal.note" class="small fst-italic mb-2">"{{ proposal.note }}"</p>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-brand" :disabled="busy" @click="answer(true)">Accept</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="answer(false)">Decline</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="openForm">Suggest another time</button>
        </div>
      </div>

      <!-- my suggestion, waiting for the other person -->
      <div v-else-if="proposal && proposal.fromMe" class="proposal-box mb-2">
        <p class="mb-1">
          You suggested <strong>{{ formatTime(proposal.startsAt) }}</strong> for {{ stageName(proposal.stage) }}.
          Waiting for {{ otherName }} to answer.
        </p>
        <p v-if="proposal.note" class="small fst-italic mb-2">"{{ proposal.note }}"</p>
        <button v-if="!formOpen" type="button" class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="openForm">
          Change my suggestion
        </button>
      </div>

      <p v-if="expiredProposal" class="small text-muted mb-2">
        A suggested time for {{ stageName(expiredProposal.stage) }} expired: the session is now less than
        {{ NOTICE_HOURS }} hours away.
      </p>

      <!-- nothing waiting: book or move the current session -->
      <template v-if="!proposal && !formOpen">
        <!-- a session still to book stands out; a booked one that can still move is quieter -->
        <div v-if="b.schedule" class="schedule-box mb-2" :class="b.schedule.kind === 'book' ? 'schedule-box-todo' : 'schedule-box-booked'">
          <span class="schedule-icon" aria-hidden="true">📅</span>
          <div class="min-w-0 flex-grow-1">
            <p v-if="b.schedule.kind === 'book'" class="fw-semibold mb-1">{{ stageName(currentStage) }} needs a session time.</p>
            <p v-else class="fw-semibold mb-1">{{ stageName(currentStage) }}: {{ formatTime(currentSessionAt) }}</p>
            <p class="small text-muted mb-2">
              <template v-if="b.schedule.kind === 'book'">Suggest a time and {{ otherName }} can accept it or suggest another.</template>
              <template v-else>You can still move it until {{ NOTICE_HOURS }} hours before.</template>
            </p>
            <div class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm btn-brand" :disabled="busy" @click="openForm">{{ scheduleButtonText }}</button>
              <button v-if="b.cancelSession" type="button" class="btn btn-sm btn-outline-danger" :disabled="busy" @click="emit('cancelSession')">
                Cancel session
              </button>
            </div>
          </div>
        </div>
        <div v-else-if="currentSessionAt" class="schedule-box schedule-box-booked mb-2">
          <span class="schedule-icon" aria-hidden="true">📅</span>
          <div class="min-w-0 flex-grow-1">
            <p class="fw-semibold mb-1">{{ stageName(currentStage) }}: {{ formatTime(currentSessionAt) }}</p>
            <p v-if="new Date(currentSessionAt) <= new Date()" class="small text-muted mb-2">
              This session has taken place.
              {{ b.role === 'learner' ? 'Write your reflection for this stage.' : 'Waiting for ' + otherName + "'s reflection." }}
            </p>
            <p v-else class="small text-muted mb-2">
              It is less than {{ NOTICE_HOURS }} hours away, so it can no longer be moved.
              <template v-if="b.cancelSession">You can still cancel it until 2 hours before.</template>
            </p>
            <button v-if="b.cancelSession" type="button" class="btn btn-sm btn-outline-danger" :disabled="busy" @click="emit('cancelSession')">
              Cancel session
            </button>
          </div>
        </div>
      </template>
    </template>

    <template v-if="mode === 'form' && b.status === 'booked' && currentStage !== -1">
      <!-- the date and time picker -->
      <form v-if="formOpen" class="propose-form mb-2" @submit.prevent="send">
        <p class="small fw-semibold mb-2">Suggest a time for {{ stageName(currentStage) }}</p>
        <div class="chat-tip small mb-2">
          <p class="mb-2">💬 Tip: chat with {{ otherName }} first to agree on a time that suits you both.</p>
          <button type="button" class="chat-button" @click="emit('chat')">
            <span aria-hidden="true">💬</span> Open chat with {{ otherName }}
          </button>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-7">
            <label :for="'date-' + b.id" class="form-label small mb-1">Date</label>
            <input :id="'date-' + b.id" v-model="date" type="date" class="form-control form-control-sm" :min="minDate" required />
          </div>
          <div class="col-5">
            <label :for="'time-' + b.id" class="form-label small mb-1">Time</label>
            <input :id="'time-' + b.id" v-model="time" type="time" class="form-control form-control-sm" required />
          </div>
        </div>
        <label :for="'note-' + b.id" class="form-label small mb-1">Note (optional)</label>
        <textarea
          :id="'note-' + b.id"
          v-model="note"
          class="form-control form-control-sm mb-2"
          rows="2"
          maxlength="300"
          placeholder="e.g. Sunday mornings work better for me."
        ></textarea>
        <p class="small text-muted mb-2">Singapore time. At least {{ NOTICE_HOURS }} hours from now.</p>
        <p v-if="formError" class="small text-danger mb-2">{{ formError }}</p>
        <div class="d-flex gap-2">
          <button type="submit" class="btn btn-sm btn-brand" :disabled="busy">{{ busy ? 'Sending...' : 'Send suggestion' }}</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" @click="emit('done')">Cancel</button>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.stage-times {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}

.stage-time {
  padding: 8px 12px;
  margin-bottom: 6px;
  border: 1px solid var(--k-border);
  border-radius: 10px;
}

.stage-time.done {
  background: var(--k-surface-alt);
}

.pill {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  white-space: nowrap;
}

.pill-done {
  background: #dcebdf;
  color: #2f5d3d;
}

.pill-now {
  background: var(--k-brand-soft);
  color: #6b4423;
}

.proposal-box,
.propose-form {
  padding: 10px 12px;
  border: 1px solid var(--k-border);
  border-left: 4px solid var(--k-brand);
  border-radius: 10px;
  background: var(--k-surface);
}

/* "forgor cancelled the Stage 2 session …" */
.cancelled-box {
  padding: 10px 12px;
  border: 1px solid #f0d58a;
  border-left: 5px solid #c99a12;
  border-radius: 10px;
  background: #fff7dd;
  color: #6b5200;
}

/* "forgor accepted your time …" */
.agreed-box {
  padding: 10px 12px;
  border: 1px solid #b9d8c1;
  border-left: 5px solid #2f7d4a;
  border-radius: 10px;
  background: #e8f4eb;
  color: #2f5d3d;
}

.new-pill {
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--k-danger);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}

/* "Stage 2 needs a session time" / "Stage 2: Sat 15 Nov, 14:00" with its button */
.schedule-box {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--k-border);
  border-radius: 12px;
}

/* a session still to book: light brown with a tan edge, so it stands out */
.schedule-box-todo {
  background: var(--k-brand-soft);
  border-color: var(--k-brand);
  border-left: 5px solid var(--k-brand);
}

/* a booked session that can still be moved: the same box, quieter */
.schedule-box-booked {
  background: var(--k-surface-alt);
  border-left: 5px solid var(--k-border);
}

.schedule-icon {
  font-size: 22px;
  line-height: 1;
}

.chat-tip {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--k-surface-alt);
}

/* "Open chat with ..." in the tip: a small pill, like the other buttons */
.chat-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--k-accent);
  border-radius: 999px;
  background: var(--k-surface);
  color: var(--k-accent);
  font-size: 13px;
  font-weight: 600;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.chat-button:hover {
  background: var(--k-accent);
  color: var(--k-on-accent);
}

.chat-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--k-brand-soft);
}

.min-w-0 {
  min-width: 0;
}
</style>
