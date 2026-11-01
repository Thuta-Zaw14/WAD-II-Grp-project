<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { getMessages, sendChatMessage, errorText } from '../services/api'
import ReportBox from './ReportBox.vue'

// The private chat of one booking (shown on the chat page, ChatPage.vue).
// The page asks the server for new messages every few seconds (the browser never talks to
// Firestore itself). Every message has a number n, so each time it asks for "everything after
// the last number I have".
const props = defineProps({
  bookingId: { type: String, required: true },
  otherName: { type: String, default: '' }, // who the chat is with (for the "say hello" line)
})
const emit = defineEmits(['loaded']) // gives the page the header info of the booking (title, status ...)

const maxLength = 500
const checkEverySeconds = 5

const messages = ref([])
const open = ref(true) // false when the booking is finished or cancelled: read only
const loading = ref(true)
const text = ref('')
const sending = ref(false)
const error = ref('')
const blocked = ref(false) // true when this chat is not for me: nothing to show or send
const listEl = ref(null)
const reportingN = ref(0) // the message whose report form is open (0 = none)
const reportedNs = ref([]) // the messages I reported during this visit

let lastN = 0 // the number of the newest message already on the screen
let fetching = false // so two requests never run at once (they could add the same message twice)
let timer = null

// stop asking when the server says this chat is not for me (or does not exist)
function stopChecking() {
  clearInterval(timer)
}

function scrollDown() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

async function load() {
  if (fetching) return
  fetching = true
  try {
    const data = await getMessages(props.bookingId, lastN)
    open.value = data.open
    if (data.messages.length > 0) {
      messages.value = [...messages.value, ...data.messages]
      lastN = data.messages[data.messages.length - 1].n
      scrollDown()
    }
    error.value = ''
    emit('loaded', data.booking)
  } catch (err) {
    error.value = errorText(err)
    if (err.response && [403, 404].includes(err.response.status)) {
      blocked.value = true
      stopChecking()
    }
  }
  loading.value = false
  fetching = false
}

async function send() {
  const content = text.value.trim()
  if (content === '' || sending.value) return
  sending.value = true
  error.value = ''
  try {
    await sendChatMessage(props.bookingId, content)
    text.value = ''
    await load() // fetches my message AND anything the other person wrote meanwhile
  } catch (err) {
    error.value = errorText(err)
  }
  sending.value = false
}

function startReport(n) {
  reportingN.value = reportingN.value === n ? 0 : n
}

// "8 Nov, 14:05" in Singapore time
function formatTime(iso) {
  return new Date(iso).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  load()
  timer = setInterval(() => {
    if (!document.hidden) load() // no need to ask while the tab is not visible
  }, checkEverySeconds * 1000)
})

onUnmounted(stopChecking)
</script>

<template>
  <div class="chat border rounded bg-white">
    <p v-if="blocked" class="small text-danger p-3 mb-0">{{ error }}</p>

    <div v-else ref="listEl" class="chat-list p-2">
      <p v-if="loading" class="small text-muted mb-0">Loading the chat...</p>
      <p v-else-if="messages.length === 0" class="small text-muted mb-0">
        No messages yet.<template v-if="open"> Say hello to {{ otherName }}!</template>
      </p>

      <div v-for="m in messages" :key="m.n" class="mb-2">
        <div class="d-flex" :class="m.mine ? 'justify-content-end' : 'justify-content-start'">
          <div class="bubble rounded px-2 py-1" :class="m.mine ? 'mine' : 'theirs'">
            <div class="small text-muted">
              {{ m.mine ? 'You' : m.senderName }} · {{ formatTime(m.createdAt) }}
              <template v-if="!m.mine">
                ·
                <span v-if="reportedNs.includes(m.n)">Reported</span>
                <button v-else type="button" class="link-button" @click="startReport(m.n)">Report</button>
              </template>
            </div>
            <div class="text">{{ m.text }}</div>
          </div>
        </div>
        <!-- the report form opens under the message it is about -->
        <ReportBox
          v-if="reportingN === m.n"
          kind="private"
          :container-id="bookingId"
          :n="m.n"
          @reported="reportedNs.push(m.n)"
          @close="reportingN = 0"
        />
      </div>
    </div>

    <p v-if="error && !blocked" class="small text-danger px-2 mb-1">{{ error }}</p>

    <form v-if="open && !blocked" class="border-top p-2" @submit.prevent="send">
      <textarea
        v-model="text"
        class="form-control form-control-sm mb-1"
        rows="3"
        :maxlength="maxLength"
        placeholder="Write a message... (Enter to send, Shift+Enter for a new line)"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <div class="d-flex justify-content-between align-items-center">
        <small class="text-muted">{{ text.length }}/{{ maxLength }}</small>
        <button type="submit" class="btn btn-sm btn-brand" :disabled="sending || text.trim() === ''">Send</button>
      </div>
    </form>
    <p v-else-if="!blocked" class="small text-muted border-top p-2 mb-0">
      This booking is over, so the chat is closed. You can still read it.
    </p>
  </div>
</template>

<style scoped>
.chat-list {
  height: 55vh;
  min-height: 280px;
  overflow-y: auto;
  background: #fbf8f0;
}

.bubble {
  max-width: 85%;
}

.bubble.mine {
  background: #f1dcc6;
}

.bubble.theirs {
  background: white;
  border: 1px solid #e3d9bf;
}

/* the small "Report" link under a message of the other person */
.link-button {
  background: none;
  border: none;
  padding: 0;
  color: #9c6e48;
  text-decoration: underline;
  font-size: inherit;
}

.link-button:hover {
  color: #7a5535;
}

/* keeps the line breaks the person typed, and wraps very long words */
.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.btn-brand {
  background: #b5835a;
  border-color: #b5835a;
  color: white;
  font-weight: 600;
}

.btn-brand:hover:not(:disabled) {
  background: #9c6e48;
  border-color: #9c6e48;
  color: white;
}
</style>
