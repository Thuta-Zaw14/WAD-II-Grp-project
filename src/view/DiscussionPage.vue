<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { getDiscussion, sendPost, removePost, errorText } from '../services/api'
import ReportBox from '../components/ReportBox.vue'

// The public discussion of one course, at /discussion/<course id>. Everyone who is signed in can
// read it and write in it. The page asks the server for new posts every few seconds (the browser
// never talks to Firestore itself). Every post has a number n, so each time it asks for
// "everything after the last number I have".
const props = defineProps({
  id: { type: String, required: true }, // the course id, from the address (the route has props: true)
})

const router = useRouter()

const maxLength = 500
const checkEverySeconds = 10

const ready = ref(false) // true once Firebase has restored the login
const course = ref(null) // { id, title, teacherName, isMine }
const posts = ref([])
const earlier = ref(0) // older posts the server did not send
const open = ref(true) // false when the discussion is full
const loading = ref(true)
const text = ref('')
const sending = ref(false)
const error = ref('')
const blocked = ref(false) // true when there is nothing to show (no such course, or my account is suspended)
const reportingN = ref(0) // the post whose report form is open (0 = none)
const reportedNs = ref([]) // the posts I reported during this visit
const listEl = ref(null)

let lastN = 0 // how many posts the server had when we last asked
let fetching = false // so two requests never run at once
let timer = null

function stopChecking() {
  clearInterval(timer)
}

// only follow new posts down the page when the reader is already at the bottom
function atBottom() {
  const el = listEl.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

function scrollDown() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

async function load(forceScroll = false) {
  if (fetching) return
  fetching = true
  try {
    const wasAtBottom = atBottom()
    const data = await getDiscussion(props.id, lastN)
    course.value = data.course
    open.value = data.open

    if (lastN === 0 || data.replace) {
      posts.value = data.posts // the page was just opened, or was away for so long that it starts again
      earlier.value = data.earlier
    } else if (data.posts.length > 0) {
      posts.value = [...posts.value, ...data.posts]
    }
    lastN = data.count

    // posts that were taken down since this page got them
    for (const post of posts.value) {
      if (!post.removed && data.removed.includes(post.n)) {
        post.removed = true
        post.text = ''
        post.canDelete = false
      }
    }

    if (data.posts.length > 0 && (forceScroll || wasAtBottom)) scrollDown()
    error.value = ''
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
    await sendPost(props.id, content)
    text.value = ''
    await load(true) // fetches my post AND anything others wrote meanwhile
  } catch (err) {
    error.value = errorText(err)
  }
  sending.value = false
}

async function remove(post) {
  if (!window.confirm('Remove this message? Nobody will be able to read it.')) return
  error.value = ''
  try {
    await removePost(props.id, post.n)
    post.removed = true
    post.removedBy = post.mine ? 'author' : 'teacher'
    post.text = ''
    post.canDelete = false
  } catch (err) {
    error.value = errorText(err)
  }
}

function startReport(n) {
  reportingN.value = reportingN.value === n ? 0 : n
}

function removedText(post) {
  if (post.removedBy === 'author') return 'This message was removed by its author.'
  if (post.removedBy === 'teacher') return 'This message was removed by the teacher.'
  if (post.removedBy === 'admin') return 'This message was removed by an admin.'
  return 'This message was removed.'
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

onMounted(async () => {
  await auth.authStateReady() // after a refresh Firebase needs a moment to restore the login
  if (!auth.currentUser) {
    router.push('/login')
    return
  }
  ready.value = true
  load(true)
  timer = setInterval(() => {
    if (!document.hidden) load() // no need to ask while the tab is not visible
  }, checkEverySeconds * 1000)
})

onUnmounted(stopChecking)
</script>

<template>
  <nav class="navbar border-bottom px-3">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <span class="text-dark" role="button" @click="router.push('/home')">Back to courses</span>
  </nav>

  <div class="container py-4 discussion-container">
    <div class="p-4 mb-3 rounded banner">
      <h1 class="h4 mb-1">Questions &amp; discussion</h1>
      <p v-if="course" class="mb-0">{{ course.title }} · taught by {{ course.teacherName }}</p>
      <p v-else class="mb-0">Everyone on Kongsi can read and write here.</p>
      <p v-if="course && course.isMine" class="small mb-0 mt-1">This is your course: you can remove any message here.</p>
    </div>

    <div v-if="ready" class="border rounded bg-white">
      <p v-if="blocked" class="small text-danger p-3 mb-0">{{ error }}</p>

      <div v-else ref="listEl" class="post-list p-2">
        <p v-if="loading" class="small text-muted mb-0">Loading the discussion...</p>
        <p v-else-if="posts.length === 0" class="small text-muted mb-0">Nobody has written here yet. Ask the first question!</p>
        <p v-if="!loading && earlier > 0" class="small text-muted text-center">
          {{ earlier }} earlier message{{ earlier === 1 ? '' : 's' }} not shown.
        </p>

        <div v-for="p in posts" :key="p.n" class="post mb-2 rounded px-2 py-1" :class="{ mine: p.mine, gone: p.removed }">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="small text-muted">
              <strong class="text-dark">{{ p.mine ? 'You' : p.authorName }}</strong>
              <span v-if="p.isTeacher" class="badge text-bg-dark ms-1">Teacher</span>
              · {{ formatTime(p.createdAt) }}
            </div>
            <div v-if="!p.removed" class="small flex-shrink-0">
              <template v-if="!p.mine">
                <span v-if="reportedNs.includes(p.n)" class="text-muted">Reported</span>
                <button v-else type="button" class="link-button" @click="startReport(p.n)">Report</button>
              </template>
              <button v-if="p.canDelete" type="button" class="link-button ms-2" @click="remove(p)">Remove</button>
            </div>
          </div>

          <div v-if="p.removed" class="small fst-italic text-muted">{{ removedText(p) }}</div>
          <div v-else class="text">{{ p.text }}</div>

          <ReportBox
            v-if="reportingN === p.n"
            kind="public"
            :container-id="props.id"
            :n="p.n"
            @reported="reportedNs.push(p.n)"
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
          placeholder="Ask a question or share a tip... (Enter to post, Shift+Enter for a new line)"
          @keydown.enter.exact.prevent="send"
        ></textarea>
        <div class="d-flex justify-content-between align-items-center">
          <small class="text-muted">{{ text.length }}/{{ maxLength }} · everyone can read this</small>
          <button type="submit" class="btn btn-sm btn-brand" :disabled="sending || text.trim() === ''">Post</button>
        </div>
      </form>
      <p v-else-if="!blocked" class="small text-muted border-top p-2 mb-0">This discussion is full, so nobody can add to it.</p>
    </div>
  </div>
</template>

<style scoped>
.banner {
  background: #f5f0e1;
  color: #4a3f2a;
}

/* a discussion reads better in a column than stretched across a wide screen */
.discussion-container {
  max-width: 760px;
}

.post-list {
  height: 55vh;
  min-height: 280px;
  overflow-y: auto;
  background: #fbf8f0;
}

.post {
  background: white;
  border: 1px solid #e3d9bf;
}

.post.mine {
  background: #f1dcc6;
  border-color: #e3c9aa;
}

.post.gone {
  background: #f3f0e8;
}

/* keeps the line breaks the person typed, and wraps very long words */
.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

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
