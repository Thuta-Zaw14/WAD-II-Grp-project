<script setup>
import { computed } from 'vue'
import { idleState } from '../services/idleLogout'

// The "Still there?" box in the bottom right (see services/idleLogout.js).
// Clicking anywhere on the page counts as activity, which hides it again.

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
  <Transition name="slide-up">
    <div v-if="idleState.warning" class="idle-box k-card p-3" role="status" aria-live="polite">
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
}

@media (max-width: 575.98px) {
  .idle-box {
    right: 16px;
    bottom: 16px;
  }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(12px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .slide-up-enter-active,
  .slide-up-leave-active {
    transition: opacity 0.15s linear;
  }

  .slide-up-enter-from,
  .slide-up-leave-to {
    transform: none;
  }
}
</style>
