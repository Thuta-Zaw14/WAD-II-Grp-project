<script setup>
import { useRouter } from 'vue-router'

// The "← Back to …" button at the top of a form page. It goes back to the page you came from
// (e.g. Profile or My Classes) and names it; opened straight from an address, it goes to `fallback`.
const props = defineProps({
  fallback: { type: String, required: true }, // one of the paths in pageNames
})

const router = useRouter()

const pageNames = {
  '/home': 'Home',
  '/profile': 'Profile',
  '/classes': 'My Classes',
  '/courses': 'Courses',
}

// vue-router keeps the address of the page before this one in history.state.back
const state = window.history.state
const previous = state && typeof state.back === 'string' ? state.back.split('?')[0] : ''
const cameFromKnownPage = pageNames[previous] !== undefined

const label = 'Back to ' + pageNames[cameFromKnownPage ? previous : props.fallback]

function goBack() {
  if (cameFromKnownPage) router.back()
  else router.push(props.fallback)
}
</script>

<template>
  <button type="button" class="back-button" @click="goBack">
    <span class="arrow" aria-hidden="true">&larr;</span>
    {{ label }}
  </button>
</template>

<style scoped>
.back-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px 6px 6px;
  border: 1px solid var(--k-border);
  border-radius: 999px;
  background: var(--k-surface);
  color: var(--k-accent);
  font-size: 14px;
  font-weight: 600;
  box-shadow: var(--k-shadow);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--k-accent);
  color: var(--k-on-accent);
  transition: transform 0.2s ease;
}

.back-button:hover {
  border-color: var(--k-brand);
  box-shadow: var(--k-shadow-lift);
}

.back-button:hover .arrow {
  transform: translateX(-3px);
}

.back-button:focus-visible {
  outline: none;
  border-color: var(--k-brand);
  box-shadow: 0 0 0 3px var(--k-brand-soft);
}

@media (prefers-reduced-motion: reduce) {
  .back-button,
  .arrow {
    transition: none;
  }
}
</style>
