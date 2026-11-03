<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { idleState } from '../services/idleLogout'

// The "Still there?" box in the bottom right (see services/idleLogout.js).
// Clicking anywhere on the page counts as activity: the box then says "Oh! There you are!"
// for a moment and goes away.

const GREETING_MS = 1600 // how long the hello stays before the box leaves

const greeting = ref(false)
let greetingTimer = null

// the timer counts each time someone answers the box
watch(
  () => idleState.cameBack,
  () => {
    greeting.value = true
    clearTimeout(greetingTimer)
    greetingTimer = setTimeout(() => {
      greeting.value = false
    }, GREETING_MS)
  }
)

// the warning came back (another long break): drop the hello straight away
watch(
  () => idleState.warning,
  (warning) => {
    if (warning) {
      clearTimeout(greetingTimer)
      greeting.value = false
    }
  }
)

onUnmounted(() => clearTimeout(greetingTimer))

const showBox = computed(() => idleState.warning || greeting.value)

// "9:05"
const countdown = computed(() => {
  const minutes = Math.floor(idleState.secondsLeft / 60)
  const seconds = idleState.secondsLeft % 60
  return minutes + ':' + String(seconds).padStart(2, '0')
})

// screen readers hear whole minutes only, not a new number every second
const minutesLeft = computed(() => Math.max(1, Math.ceil(idleState.secondsLeft / 60)))
</script>

<template>
  <Transition name="box">
    <div v-if="showBox" class="idle-box k-card p-3" role="status" aria-live="polite">
      <!-- the two messages fade into each other -->
      <Transition name="swap" mode="out-in">
        <div v-if="greeting" key="hello" class="hello">
          <span class="wave" aria-hidden="true">👋</span>
          <p class="fw-semibold mb-0">Oh! There you are!</p>
        </div>
        <div v-else key="warning">
          <p class="fw-semibold mb-1">Still there?</p>
          <p class="small mb-2">Click anywhere on the page to stay logged in.</p>
          <p class="small text-muted mb-0">
            <span aria-hidden="true">Logging you out in {{ countdown }}</span>
            <span class="visually-hidden">
              You will be logged out in {{ minutesLeft }} minute{{ minutesLeft === 1 ? '' : 's' }}.
            </span>
          </p>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
/* The colours, and the class k-card, come from src/assets/theme.css */
.idle-box {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1070; /* above the popups (1050) and the top bar */
  width: min(300px, calc(100vw - 32px));
  border-left: 4px solid var(--k-brand);
  box-shadow: var(--k-shadow-lift);
  color: var(--k-text);
  transform-origin: bottom right;
}

@media (max-width: 575.98px) {
  .idle-box {
    right: 16px;
    bottom: 16px;
  }
}

.hello {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wave {
  font-size: 1.4rem;
  display: inline-block;
  transform-origin: 70% 70%;
  animation: wave 0.9s ease-in-out;
}

@keyframes wave {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(16deg); }
  40% { transform: rotate(-10deg); }
  60% { transform: rotate(12deg); }
  80% { transform: rotate(-4deg); }
}

/* ---------- The box coming in and going out ----------
   In: rises a little, grows from 96% and fades in, slowing gently at the end.
   Out: sinks a little and fades, a bit quicker, so it feels light. */
.box-enter-active {
  transition:
    opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.box-leave-active {
  transition:
    opacity 0.35s cubic-bezier(0.4, 0, 1, 1),
    transform 0.35s cubic-bezier(0.4, 0, 1, 1);
}

.box-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.96);
}

.box-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

/* ---------- One message fading into the other ---------- */
.swap-enter-active,
.swap-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.swap-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.swap-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* people who asked for less motion: plain fades, no sliding or waving */
@media (prefers-reduced-motion: reduce) {
  .box-enter-active,
  .box-leave-active,
  .swap-enter-active,
  .swap-leave-active {
    transition: opacity 0.2s linear;
  }

  .box-enter-from,
  .box-leave-to,
  .swap-enter-from,
  .swap-leave-to {
    transform: none;
  }

  .wave {
    animation: none;
  }
}
</style>
