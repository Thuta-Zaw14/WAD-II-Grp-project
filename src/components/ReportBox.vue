<script setup>
import { ref } from 'vue'
import { reportMessage, errorText } from '../services/api'

// A small form under one message: "What is wrong with it?". It is used in the public discussion
// (DiscussionPage.vue) and in the private chat (BookingChat.vue). The admins read the reports in
// the "Message reports" tab of the admin page.
const props = defineProps({
  kind: { type: String, required: true }, // 'public' (a discussion post) or 'private' (a chat message)
  containerId: { type: String, required: true }, // the course (public) or the booking (private)
  n: { type: Number, required: true }, // the number of the message
})
const emit = defineEmits(['reported', 'close'])

const maxLength = 300
const reason = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref('')

async function send() {
  const text = reason.value.trim()
  if (text === '' || sending.value) return
  sending.value = true
  error.value = ''
  try {
    await reportMessage(props.kind, props.containerId, props.n, text)
    sent.value = true
    emit('reported') // the page then shows "Reported" instead of the Report button
  } catch (err) {
    error.value = errorText(err)
  }
  sending.value = false
}
</script>

<template>
  <div class="report-box border rounded p-2 mt-1 bg-white">
    <div v-if="sent">
      <p class="small text-success mb-2">Thank you. An admin will look at your report.</p>
      <button type="button" class="btn btn-sm btn-outline-secondary" @click="emit('close')">Close</button>
    </div>

    <form v-else @submit.prevent="send">
      <label class="form-label small fw-semibold mb-1">What is wrong with this message?</label>
      <textarea
        v-model="reason"
        class="form-control form-control-sm mb-1"
        rows="2"
        :maxlength="maxLength"
        placeholder="e.g. It is rude, it is spam, it is not safe"
      ></textarea>
      <p class="small text-muted mb-1">
        {{ props.kind === 'private' ? 'The admins will be able to read this chat.' : 'The admins will look at this message.' }}
      </p>
      <p v-if="error" class="small text-danger mb-1">{{ error }}</p>
      <div class="d-flex justify-content-between align-items-center">
        <small class="text-muted">{{ reason.length }}/{{ maxLength }}</small>
        <div>
          <button type="button" class="btn btn-sm btn-outline-secondary me-2" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn btn-sm btn-danger" :disabled="sending || reason.trim() === ''">
            {{ sending ? 'Sending...' : 'Send report' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
