<script setup>
import { onMounted, onUnmounted } from 'vue'

// The popup frame used on My classes: "‹" goes back to the popup before, "×" closes them all.
// What goes inside is up to the page (the default slot), and buttons go in the "footer" slot.
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  canGoBack: { type: Boolean, default: false },
  // how this popup arrives: 'forward' slides in from the right (opened from the one before),
  // 'back' from the left (its next popup was closed with "‹")
  slide: { type: String, default: '' },
})
const emit = defineEmits(['back', 'close'])

function onKey(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden' // stop the page behind from scrolling
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <section
      class="k-card class-modal"
      :class="slide ? 'slide-' + slide : ''"
      role="dialog"
      aria-modal="true"
      aria-labelledby="class-modal-title"
    >
      <header class="modal-top d-flex align-items-start gap-2 px-3 py-3">
        <button
          v-if="canGoBack"
          type="button"
          class="icon-button"
          aria-label="Back"
          @click="emit('back')"
        >
          &lsaquo;
        </button>
        <div class="flex-grow-1 min-w-0">
          <h2 id="class-modal-title" class="h5 mb-0">{{ title }}</h2>
          <small v-if="subtitle" class="text-muted">{{ subtitle }}</small>
        </div>
        <button type="button" class="btn-close mt-1" aria-label="Close" @click="emit('close')"></button>
      </header>

      <div class="modal-middle px-3 py-3">
        <slot></slot>
      </div>

      <footer v-if="$slots.footer" class="modal-bottom d-flex justify-content-end flex-wrap gap-2 px-3 py-3">
        <slot name="footer"></slot>
      </footer>
    </section>
  </div>
</template>

<style scoped>
/* The colours, and the class k-card, come from src/assets/theme.css */

/* moving between popups: the new one slides in from the side it came from */
.slide-forward {
  animation: slide-from-right 0.25s ease-out;
}

.slide-back {
  animation: slide-from-left 0.25s ease-out;
}

@keyframes slide-from-right {
  from { transform: translateX(48px); opacity: 0; }
  to { transform: none; opacity: 1; }
}

@keyframes slide-from-left {
  from { transform: translateX(-48px); opacity: 0; }
  to { transform: none; opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .slide-forward,
  .slide-back {
    animation: fade-in 0.15s linear;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050; /* above the sticky top bar */
  background: rgba(35, 29, 21, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
}

.class-modal {
  width: 100%;
  max-width: 560px;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--k-text);
}

.modal-top {
  background: var(--k-surface-alt);
  border-bottom: 1px solid var(--k-border);
}

.modal-middle {
  overflow-y: auto;
}

.modal-bottom {
  border-top: 1px solid var(--k-border);
}

.min-w-0 {
  min-width: 0;
}

.icon-button {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--k-border);
  border-radius: 8px;
  background: var(--k-surface);
  color: var(--k-text);
  font-size: 22px;
  line-height: 1;
}

.icon-button:hover {
  border-color: var(--k-muted);
}
</style>
