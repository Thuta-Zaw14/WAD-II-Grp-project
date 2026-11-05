<script setup>
import { ref, computed } from 'vue'
import ClassModal from '@/components/ClassModal.vue'
import { createAssignment, updateAssignment, errorText } from '@/services/api'

// The instructor's "New assignment" / "Edit assignment" popup.
// New: pick the students (everyone who has had their class is ticked). Edit: change the text or
// the due date (e.g. give more time) and add students; nobody can be removed, so no work is lost.
const props = defineProps({
  course: { type: Object, required: true }, // { offerId, title }
  students: { type: Array, default: () => [] }, // who can get it: [{ uid, name }]
  assignment: { type: Object, default: null }, // when editing
})
const emit = defineEmits(['close', 'saved'])

const editing = computed(() => props.assignment !== null)

// <input type="datetime-local"> works in the browser's own time: "2026-11-08T18:00"
function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

// a week from now at 23:59 is a sensible first due date
function defaultDue() {
  const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  due.setHours(23, 59, 0, 0)
  return toLocalInput(due)
}

const title = ref(props.assignment ? props.assignment.title : '')
const instructions = ref(props.assignment ? props.assignment.instructions : '')
const due = ref(props.assignment ? toLocalInput(new Date(props.assignment.dueAt)) : defaultDue())
const picked = ref(editing.value ? [] : props.students.map((s) => s.uid))
const minDue = toLocalInput(new Date(Date.now() + 30 * 60 * 1000))

const errors = ref({})
const serverError = ref('')
const saving = ref(false)

const allPicked = computed(() => props.students.length > 0 && picked.value.length === props.students.length)

function toggleAll() {
  picked.value = allPicked.value ? [] : props.students.map((s) => s.uid)
}

function check() {
  const next = {}
  if (title.value.trim() === '') next.title = 'Give the assignment a title.'
  if (instructions.value.trim() === '') next.instructions = 'Tell your students what to practise.'
  const dueDate = new Date(due.value)
  if (!due.value || Number.isNaN(dueDate.getTime())) next.due = 'Pick a due date and time.'
  else if (dueDate.getTime() < Date.now() + 30 * 60 * 1000) next.due = 'The due date must be at least 30 minutes from now.'
  if (!editing.value && picked.value.length === 0) next.students = 'Pick at least one student.'
  errors.value = next
  return Object.keys(next).length === 0
}

async function save() {
  serverError.value = ''
  if (!check()) return
  saving.value = true
  try {
    const dueAt = new Date(due.value).toISOString()
    let result
    if (editing.value) {
      result = await updateAssignment(props.assignment.id, {
        title: title.value,
        instructions: instructions.value,
        // unchanged due date: send it exactly as it was, so the server does not re-check it
        dueAt: toLocalInput(new Date(props.assignment.dueAt)) === due.value ? props.assignment.dueAt : dueAt,
        addLearnerUids: picked.value,
      })
    } else {
      result = await createAssignment({
        offerId: props.course.offerId,
        title: title.value,
        instructions: instructions.value,
        dueAt: dueAt,
        learnerUids: picked.value,
      })
    }
    emit('saved', result.assignment)
  } catch (err) {
    serverError.value = errorText(err)
  }
  saving.value = false
}
</script>

<template>
  <ClassModal
    :title="editing ? 'Edit assignment' : 'New assignment'"
    :subtitle="course.title"
    @close="emit('close')"
  >
    <form id="assignment-form" novalidate data-testid="assignment-form" @submit.prevent="save">
      <div class="mb-3">
        <label for="assignment-title" class="form-label">Title</label>
        <input
          id="assignment-title"
          v-model="title"
          class="form-control"
          :class="{ 'is-invalid': errors.title }"
          maxlength="80"
          placeholder="e.g. Practise your serve 20 times"
          data-testid="assignment-title"
        />
        <div v-if="errors.title" class="invalid-feedback">{{ errors.title }}</div>
      </div>

      <div class="mb-3">
        <label for="assignment-instructions" class="form-label">What should they practise and show you?</label>
        <textarea
          id="assignment-instructions"
          v-model="instructions"
          class="form-control"
          :class="{ 'is-invalid': errors.instructions }"
          rows="4"
          maxlength="1500"
          placeholder="Explain the exercise, and what the photo or video should show."
          data-testid="assignment-instructions"
        ></textarea>
        <div v-if="errors.instructions" class="invalid-feedback">{{ errors.instructions }}</div>
      </div>

      <div class="mb-3">
        <label for="assignment-due" class="form-label">Due date</label>
        <input
          id="assignment-due"
          v-model="due"
          type="datetime-local"
          class="form-control"
          :class="{ 'is-invalid': errors.due }"
          :min="minDue"
          data-testid="assignment-due-input"
        />
        <div v-if="errors.due" class="invalid-feedback">{{ errors.due }}</div>
        <div v-else class="form-text">Work can no longer be sent after this. You can extend it later.</div>
      </div>

      <fieldset class="mb-1">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <legend class="form-label mb-0 fs-6">{{ editing ? 'Add more students' : 'Students' }}</legend>
          <button v-if="students.length > 1" type="button" class="link-button small" @click="toggleAll">
            {{ allPicked ? 'Clear all' : 'Pick all' }}
          </button>
        </div>
        <p v-if="students.length === 0" class="small text-muted mb-0">
          {{ editing ? 'Everyone who has had their class already has this assignment.' : 'No students have had their class yet.' }}
        </p>
        <div class="student-list">
          <div v-for="student in students" :key="student.uid" class="form-check">
            <input
              :id="'pick-' + student.uid"
              v-model="picked"
              class="form-check-input"
              type="checkbox"
              :value="student.uid"
            />
            <label class="form-check-label" :for="'pick-' + student.uid">{{ student.name }}</label>
          </div>
        </div>
        <div v-if="errors.students" class="text-danger small mt-1">{{ errors.students }}</div>
      </fieldset>

      <div v-if="serverError" class="alert alert-danger py-2 mt-3 mb-0" role="alert">{{ serverError }}</div>
    </form>

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="emit('close')">Cancel</button>
      <button type="submit" form="assignment-form" class="btn btn-brand" :disabled="saving" data-testid="assignment-save">
        {{ saving ? 'Saving...' : editing ? 'Save changes' : 'Set assignment' }}
      </button>
    </template>
  </ClassModal>
</template>

<style scoped>
.student-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 4px 12px;
}
</style>
