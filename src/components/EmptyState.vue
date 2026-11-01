<script setup>
// The friendly box shown when a list has nothing in it. A button can go inside it (the slot).
defineProps({
  icon: { type: String, default: '' }, // an emoji
  title: { type: String, required: true },
  text: { type: String, default: '' },
})
</script>

<template>
  <div class="empty text-center px-3 py-4">
    <div v-if="icon" class="icon mb-2" aria-hidden="true">{{ icon }}</div>
    <p class="fw-semibold mb-1">{{ title }}</p>
    <p v-if="text" class="small text-muted mb-0">{{ text }}</p>
    <div v-if="$slots.default" class="mt-3">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.empty {
  border: 2px dashed var(--k-border);
  border-radius: var(--k-radius);
  background: var(--k-surface);
}

.icon {
  font-size: 30px;
  line-height: 1;
}
</style>
