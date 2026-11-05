<script setup>
import { ref, watch, computed } from 'vue'
import StarRating from './StarRating.vue'

// The instructor's grading box under a student's work: pick 1 to 5 stars and write feedback,
// OR send the work back with a note saying what to redo. It only checks the form and tells the
// page what was chosen (the 'grade' and 'redo' events); the page sends it to the server.
const props = defineProps({
  // { status: 'submitted' | 'reviewed' | 'redo', stars, feedback, redoNote, redoUntil }
  submission: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  maxLength: { type: Number, default: 1000 },
})
const emit = defineEmits(['grade', 'redo'])

const stars = ref(null)
const feedback = ref('')
const redoNote = ref('')
const mode = ref('grade') // 'grade' | 'redo'
const error = ref('')

// start from the grade already given (when changing it)
watch(
  () => props.submission,
  (submission) => {
    stars.value = submission.stars || null
    feedback.value = submission.feedback || ''
    redoNote.value = ''
    mode.value = 'grade'
    error.value = ''
  },
  { immediate: true }
)

const regrading = computed(() => props.submission.status === 'reviewed')
const canRedo = computed(() => props.submission.status === 'submitted')

function sendGrade() {
  error.value = ''
  if (!stars.value) {
    error.value = 'Pick 1 to 5 stars first.'
    return
  }
  if (feedback.value.trim().length > props.maxLength) {
    error.value = 'Keep feedback to ' + props.maxLength + ' characters.'
    return
  }
  emit('grade', { stars: stars.value, feedback: feedback.value.trim() })
}

function sendRedo() {
  error.value = ''
  if (redoNote.value.trim() === '') {
    error.value = 'Tell the student what to change.'
    return
  }
  emit('redo', { note: redoNote.value.trim() })
}

function switchMode(next) {
  mode.value = next
  error.value = ''
}
</script>

<template>
  <section class="review k-card k-form-card p-3" aria-labelledby="review-title" data-testid="submission-review">
    <div v-if="submission.status === 'redo'" class="text-muted small" data-testid="review-waiting">
      <p id="review-title" class="eyebrow mb-1">REDO REQUESTED</p>
      You asked for a redo: "{{ submission.redoNote }}". The student can send new work until then.
    </div>

    <template v-else>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <p id="review-title" class="eyebrow mb-0">{{ regrading ? 'CHANGE THE GRADE' : 'YOUR REVIEW' }}</p>
        <div v-if="canRedo" class="btn-group btn-group-sm" role="group" aria-label="Review type">
          <button
            type="button"
            class="btn"
            :class="mode === 'grade' ? 'btn-accent' : 'btn-outline-secondary'"
            :aria-pressed="mode === 'grade' ? 'true' : 'false'"
            data-testid="mode-grade"
            @click="switchMode('grade')"
          >Grade</button>
          <button
            type="button"
            class="btn"
            :class="mode === 'redo' ? 'btn-accent' : 'btn-outline-secondary'"
            :aria-pressed="mode === 'redo' ? 'true' : 'false'"
            data-testid="mode-redo"
            @click="switchMode('redo')"
          >Ask for a redo</button>
        </div>
      </div>

      <form v-if="mode === 'grade'" novalidate @submit.prevent="sendGrade">
        <div class="mb-3">
          <span class="form-label d-block">How well did they do?</span>
          <StarRating v-model="stars" size="lg" label="Stars" />
        </div>
        <label for="review-feedback" class="form-label">Feedback <span class="text-muted small">(optional)</span></label>
        <textarea
          id="review-feedback"
          v-model="feedback"
          class="form-control mb-1"
          rows="3"
          :maxlength="maxLength"
          placeholder="What went well, and what to work on next."
          data-testid="review-feedback"
        ></textarea>
        <div class="d-flex justify-content-between align-items-center gap-2 mt-2">
          <small class="text-muted">{{ feedback.length }}/{{ maxLength }}</small>
          <button type="submit" class="btn btn-brand" :disabled="busy" data-testid="save-grade">
            {{ busy ? 'Saving...' : regrading ? 'Update grade' : 'Save grade' }}
          </button>
        </div>
      </form>

      <form v-else novalidate @submit.prevent="sendRedo">
        <label for="review-redo" class="form-label">What should they change?</label>
        <textarea
          id="review-redo"
          v-model="redoNote"
          class="form-control mb-1"
          rows="3"
          :maxlength="maxLength"
          placeholder="e.g. Film from the side so I can see your elbow."
          data-testid="review-redo-note"
        ></textarea>
        <p class="small text-muted mb-0">They get 3 more days to send it again, even after the due date.</p>
        <div class="d-flex justify-content-end mt-2">
          <button type="submit" class="btn btn-brand" :disabled="busy" data-testid="send-redo">
            {{ busy ? 'Sending...' : 'Send redo request' }}
          </button>
        </div>
      </form>

      <div v-if="error" class="text-danger small mt-2" role="alert" data-testid="review-error">{{ error }}</div>
    </template>
  </section>
</template>
