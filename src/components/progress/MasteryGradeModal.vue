<script setup>
import { ref } from 'vue'
import ClassModal from '@/components/ClassModal.vue'
import { setMastery, errorText } from '@/services/api'
import { MASTERY_INFO, GRADABLE_LEVELS } from '@/services/progressRules'

// The instructor's final grade for one student on one course, given once the course is finished.
// It shows on the student's skill card. "Mastered" with every assignment done can earn the
// student a bonus credit (the server decides: server/models/progressRules.js).
const props = defineProps({
  course: { type: Object, required: true }, // { offerId, title }
  student: { type: Object, required: true }, // { uid, name, mastery }
})
const emit = defineEmits(['close', 'saved'])

const level = ref(props.student.mastery ? props.student.mastery.level : '')
const summary = ref(props.student.mastery ? props.student.mastery.summary : '')
const error = ref('')
const saving = ref(false)

async function save() {
  error.value = ''
  if (!level.value) {
    error.value = 'Pick a level.'
    return
  }
  if (summary.value.trim() === '') {
    error.value = 'Write a short summary of their progress.'
    return
  }
  saving.value = true
  try {
    const result = await setMastery({
      offerId: props.course.offerId,
      learnerUid: props.student.uid,
      level: level.value,
      summary: summary.value,
    })
    emit('saved', result)
  } catch (err) {
    error.value = errorText(err)
  }
  saving.value = false
}
</script>

<template>
  <ClassModal title="Final mastery grade" :subtitle="student.name + ' · ' + course.title" @close="emit('close')">
    <form id="mastery-form" novalidate data-testid="mastery-form" @submit.prevent="save">
      <fieldset class="mb-3">
        <legend class="form-label fs-6">How far did they get?</legend>
        <div class="levels">
          <label
            v-for="key in GRADABLE_LEVELS"
            :key="key"
            class="level"
            :class="{ picked: level === key }"
            :data-testid="'level-' + key"
          >
            <input v-model="level" type="radio" name="mastery-level" :value="key" class="visually-hidden" />
            <span class="icon" aria-hidden="true">{{ MASTERY_INFO[key].icon }}</span>
            <span class="fw-semibold">{{ MASTERY_INFO[key].label }}</span>
            <span class="small text-muted">{{ MASTERY_INFO[key].text }}</span>
          </label>
        </div>
      </fieldset>

      <label for="mastery-summary" class="form-label">Summary for {{ student.name }}</label>
      <textarea
        id="mastery-summary"
        v-model="summary"
        class="form-control"
        rows="3"
        maxlength="600"
        placeholder="Their strengths, and what to keep practising."
        data-testid="mastery-summary"
      ></textarea>
      <p class="small text-muted mt-2 mb-0">It appears on their skill card on their profile.</p>

      <div v-if="error" class="alert alert-danger py-2 mt-3 mb-0" role="alert">{{ error }}</div>
    </form>

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="emit('close')">Cancel</button>
      <button type="submit" form="mastery-form" class="btn btn-brand" :disabled="saving" data-testid="mastery-save">
        {{ saving ? 'Saving...' : 'Save grade' }}
      </button>
    </template>
  </ClassModal>
</template>

<style scoped>
.levels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.level {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  padding: 14px 10px;
  border: 2px solid var(--k-border);
  border-radius: 14px;
  background: var(--k-surface);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.level:hover {
  border-color: var(--k-muted);
}

.level.picked {
  border-color: var(--k-brand);
  background: #fff6ea;
}

.level:focus-within {
  outline: 3px solid rgba(154, 106, 68, 0.35);
  outline-offset: 1px;
}

.icon {
  font-size: 26px;
}

@media (max-width: 575.98px) {
  .levels {
    grid-template-columns: 1fr;
  }

  .level {
    flex-direction: row;
    text-align: left;
    gap: 10px;
  }
}
</style>
