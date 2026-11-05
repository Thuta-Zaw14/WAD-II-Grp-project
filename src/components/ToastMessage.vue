<script setup>
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
</script>

<template>
  <div v-if="toast.message" class="toast-box" role="status">
    <span>{{ toast.message }}</span>
    <button type="button" class="btn-close btn-close-white" aria-label="Close" @click="toast.hide()"></button>
  </div>
</template>

<style scoped>
.toast-box {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 3000; /* above the booking popup and the map */
  width: max-content;
  max-width: calc(100% - 32px);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px 12px 20px;
  border-radius: 12px;
  background: var(--k-accent);
  color: var(--k-on-accent);
  box-shadow: var(--k-shadow-lift);
  animation: pop-up 0.25s ease-out;
}

/* slides up a little as it appears */
@keyframes pop-up {
  from {
    opacity: 0;
    transform: translate(-50%, 12px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast-box {
    animation: none;
  }
}
</style>
