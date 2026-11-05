<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { getMessages, sendChatMessage, errorText } from '../services/api'
import ReportBox from './ReportBox.vue'
import UserAvatar from './UserAvatar.vue'
import LoadingText from './LoadingText.vue'

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
const open = ref(true) // false when the booking was cancelled: read only (a finished course stays open)
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
  <div class="chat k-card overflow-hidden">
    <p v-if="blocked" class="small text-danger p-3 mb-0">{{ error }}</p>

    <div v-else ref="listEl" class="chat-list p-3">
      <LoadingText v-if="loading" class="small mb-0" text="Loading the chat..." />
      <p v-else-if="messages.length === 0" class="text-center text-muted my-4">
        <span class="d-block fs-3" aria-hidden="true">👋</span>
        No messages yet.<template v-if="open"> Say hello to {{ otherName }}!</template>
      </p>

      <div v-for="m in messages" :key="m.n" class="mb-3">
        <div class="d-flex align-items-end gap-2" :class="m.mine ? 'justify-content-end' : 'justify-content-start'">
          <UserAvatar v-if="!m.mine" :name="m.senderName" />
          <div class="bubble px-3 py-2" :class="m.mine ? 'mine' : 'theirs'">
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

    <form v-if="open && !blocked" class="composer border-top p-2" @submit.prevent="send">
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
    <p v-else-if="!blocked" class="small text-muted border-top p-3 mb-0">
      This booking was cancelled, so the chat is closed. You can still read it.
    </p>
  </div>
</template>

<style scoped>
/* The list grows with the messages, so the box to write in sits right under the last one.
   Once it is taller than about half the screen it scrolls. */
.chat-list {
  min-height: 180px;
  max-height: 55vh;
  overflow-y: auto;
  background: var(--k-bg);
}

.bubble {
  max-width: 80%;
  border-radius: 18px;
}

/* my messages on the right, with the corner nearest me less round */
.bubble.mine {
  background: var(--k-brand-soft);
  border-bottom-right-radius: 4px;
}

.bubble.theirs {
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  border-bottom-left-radius: 4px;
}

/* keeps the line breaks the person typed, and wraps very long words */
.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.composer {
  background: var(--k-surface);
}
</style>
