<script setup>
import { ref } from 'vue'

// The conversation under one piece of work, between the student and their instructor.
// My own comments are on the right, like the class chat.
const props = defineProps({
  comments: { type: Array, default: () => [] }, // [{ by: 'teacher' | 'learner', name, text, at }]
  myRole: { type: String, required: true }, // 'teacher' | 'learner'
  busy: { type: Boolean, default: false },
  maxLength: { type: Number, default: 500 },
})
const emit = defineEmits(['send'])

const text = ref('')
const error = ref('')

function send() {
  error.value = ''
  const clean = text.value.trim()
  if (clean === '') {
    error.value = 'Write a comment first.'
    return
  }
  emit('send', clean)
}

// the page clears the box once the server has saved the comment
function clear() {
  text.value = ''
}
defineExpose({ clear })

function when(at) {
  return new Date(at).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <section class="thread" aria-labelledby="thread-title" data-testid="comment-thread">
    <h3 id="thread-title" class="h6 mb-3">Comments <span class="text-muted fw-normal">({{ comments.length }})</span></h3>

    <p v-if="comments.length === 0" class="small text-muted">
      {{ myRole === 'teacher' ? 'Leave a tip or ask a question about this work.' : 'Ask your instructor a question about this work.' }}
    </p>

    <ol class="list-unstyled mb-3">
      <li
        v-for="(comment, index) in comments"
        :key="index"
        class="bubble-row"
        :class="{ mine: comment.by === myRole }"
        data-testid="comment"
      >
        <div class="bubble">
          <div class="small fw-semibold">
            {{ comment.by === myRole ? 'You' : comment.name }}
            <span v-if="comment.by === 'teacher'" class="role">Instructor</span>
          </div>
          <p class="mb-1 text">{{ comment.text }}</p>
          <time class="tiny text-muted" :datetime="comment.at">{{ when(comment.at) }}</time>
        </div>
      </li>
    </ol>

    <form class="d-flex gap-2 align-items-start" novalidate @submit.prevent="send">
      <label for="comment-text" class="visually-hidden">Write a comment</label>
      <textarea
        id="comment-text"
        v-model="text"
        class="form-control"
        rows="2"
        :maxlength="maxLength"
        placeholder="Write a comment..."
        data-testid="comment-input"
        @input="error = ''"
      ></textarea>
      <button type="submit" class="btn btn-brand" :disabled="busy" data-testid="comment-send">
        {{ busy ? '...' : 'Send' }}
      </button>
    </form>
    <div v-if="error" class="text-danger small mt-1" role="alert">{{ error }}</div>
  </section>
</template>

<style scoped>
.bubble-row {
  display: flex;
  margin-bottom: 10px;
}

.bubble-row.mine {
  justify-content: flex-end;
}

.bubble {
  max-width: min(85%, 520px);
  padding: 8px 12px;
  border-radius: 14px 14px 14px 4px;
  background: var(--k-surface-alt);
  border: 1px solid var(--k-border);
}

.mine .bubble {
  border-radius: 14px 14px 4px 14px;
  background: var(--k-brand-soft);
}

.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.role {
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--k-accent);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
}

.tiny {
  font-size: 11px;
}
</style>
