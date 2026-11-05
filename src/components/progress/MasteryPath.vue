<script setup>
// The four steps of learning one skill: Class taken -> Course finished -> Practice -> Mastery.
// A row of steps on a wide screen, a column on a phone.
defineProps({
  steps: { type: Array, required: true }, // [{ key, label, detail, done }] from courseJourney()
})
</script>

<template>
  <ol class="path list-unstyled mb-0" aria-label="Mastery journey" data-testid="mastery-path">
    <li v-for="(step, index) in steps" :key="step.key" class="step" :class="{ done: step.done }">
      <span class="dot" aria-hidden="true">{{ step.done ? '✓' : index + 1 }}</span>
      <span class="words">
        <span class="label">{{ step.label }}<span class="visually-hidden">{{ step.done ? ' (done)' : ' (not yet)' }}</span></span>
        <span class="detail">{{ step.detail }}</span>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.path {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  counter-reset: step;
}

.step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}

/* the line between two steps */
.step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 15px;
  left: calc(50% + 18px);
  right: calc(-50% + 18px);
  height: 3px;
  border-radius: 2px;
  background: var(--k-border);
}

.step.done:not(:last-child)::after {
  background: var(--k-brand);
}

.dot {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid var(--k-border);
  background: var(--k-surface);
  color: var(--k-muted);
  font-weight: 700;
  font-size: 13px;
}

.done .dot {
  border-color: var(--k-brand);
  background: var(--k-brand);
  color: #fff;
}

.words {
  display: flex;
  flex-direction: column;
}

.label {
  font-size: 13px;
  font-weight: 600;
}

.detail {
  font-size: 12px;
  color: var(--k-muted);
}

/* a phone: the steps go down the screen, the line runs down the left */
@media (max-width: 575.98px) {
  .path {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .step {
    flex-direction: row;
    text-align: left;
    gap: 12px;
  }

  .step:not(:last-child)::after {
    top: 34px;
    bottom: -14px;
    left: 15px;
    right: auto;
    width: 3px;
    height: auto;
  }
}
</style>
