<script setup>
// 1 to 5 stars. With v-model it is a picker (the instructor grading); with `readonly` it only
// shows a grade. Each star is a radio button, so it works with the keyboard and screen readers.
const stars = defineModel({ type: Number, default: null })
const props = defineProps({
  readonly: { type: Boolean, default: false },
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
  label: { type: String, default: 'Grade' },
})

function pick(value) {
  if (!props.readonly) stars.value = value
}

// arrow keys move the choice, like any radio group
function onKey(event, value) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    event.preventDefault()
    pick(Math.min(5, value + 1))
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    event.preventDefault()
    pick(Math.max(1, value - 1))
  }
}
</script>

<template>
  <span
    v-if="readonly"
    class="stars"
    :class="'stars-' + size"
    role="img"
    :aria-label="(stars || 0) + ' out of 5 stars'"
    data-testid="star-display"
  >
    <span v-for="n in 5" :key="n" class="star" :class="{ on: n <= (stars || 0) }" aria-hidden="true">★</span>
  </span>

  <div v-else class="stars" :class="'stars-' + size" role="radiogroup" :aria-label="label" data-testid="star-picker">
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      role="radio"
      class="star star-button"
      :class="{ on: n <= (stars || 0) }"
      :aria-checked="stars === n ? 'true' : 'false'"
      :aria-label="n + (n === 1 ? ' star' : ' stars')"
      :tabindex="stars === n || (!stars && n === 1) ? 0 : -1"
      :data-testid="'star-' + n"
      @click="pick(n)"
      @keydown="onKey($event, n)"
    >★</button>
  </div>
</template>

<style scoped>
.stars {
  display: inline-flex;
  gap: 2px;
  line-height: 1;
}

.star {
  color: #dccfb8;
  font-size: 18px;
}

.stars-sm .star { font-size: 14px; }
.stars-lg .star { font-size: 30px; }

.star.on {
  color: #d9a21b;
}

.star-button {
  background: none;
  border: none;
  padding: 2px;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.star-button:hover {
  transform: scale(1.15);
}

.star-button:focus-visible {
  outline: 2px solid var(--k-brand);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .star-button { transition: none; }
}
</style>
