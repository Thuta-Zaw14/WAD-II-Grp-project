<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import { getDiscussion, sendPost, removePost, errorText } from '../services/api'
import ReportBox from '../components/ReportBox.vue'
import NavBar from '../components/NavBar.vue'
import UserAvatar from '../components/UserAvatar.vue'
import LoadingText from '../components/LoadingText.vue'

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
  <NavBar />

  <div class="container py-4 discussion-container">
    <a href="#" class="back-link small" @click.prevent="router.push('/home')">&larr; Back to courses</a>

    <div class="p-4 mt-2 mb-3 banner">
      <h1 class="h4 mb-1">Questions &amp; discussion</h1>
      <p v-if="course" class="mb-0">{{ course.title }} · taught by {{ course.teacherName }}</p>
      <p v-else class="mb-0">Everyone on Kongsi can read and write here.</p>
      <p v-if="course && course.isMine" class="small mb-0 mt-1">This is your course: you can remove any message here.</p>
    </div>

    <div v-if="ready" class="k-card overflow-hidden">
      <p v-if="blocked" class="small text-danger p-3 mb-0">{{ error }}</p>

      <div v-else ref="listEl" class="post-list p-3">
        <LoadingText v-if="loading" class="small mb-0" text="Loading the discussion..." />
        <p v-else-if="posts.length === 0" class="text-center text-muted my-4">
          <span class="d-block fs-3" aria-hidden="true">💬</span>
          Nobody has written here yet. Ask the first question!
        </p>
        <p v-if="!loading && earlier > 0" class="small text-muted text-center">
          {{ earlier }} earlier message{{ earlier === 1 ? '' : 's' }} not shown.
        </p>

        <div v-for="p in posts" :key="p.n" class="post d-flex gap-2 mb-2 p-2" :class="{ mine: p.mine, gone: p.removed }">
          <UserAvatar :name="p.authorName" />
          <div class="flex-grow-1">
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
      </div>

      <p v-if="error && !blocked" class="small text-danger px-2 mb-1">{{ error }}</p>

      <form v-if="open && !blocked" class="composer border-top p-2" @submit.prevent="send">
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
      <p v-else-if="!blocked" class="small text-muted border-top p-3 mb-0">This discussion is full, so nobody can add to it.</p>
    </div>
  </div>
</template>

<style scoped>
.back-link {
  color: var(--k-muted);
  text-decoration: none;
}

/* a discussion reads better in a column than stretched across a wide screen */
.discussion-container {
  max-width: 760px;
}

/* The list grows with the posts, so the box to write in sits right under the last one.
   Once it is taller than about half the screen it scrolls. */
.post-list {
  min-height: 180px;
  max-height: 55vh;
  overflow-y: auto;
  background: var(--k-bg);
}

.post {
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  border-radius: 14px;
}

.post.mine {
  background: var(--k-brand-soft);
  border-color: #e6cdb0;
}

.post.gone {
  background: var(--k-surface-alt);
  opacity: 0.8;
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
