<script setup>
import { computed } from 'vue'

// A circle with the first letter of someone's name, shown next to their name
const props = defineProps({
  name: { type: String, default: '' },
})

const initial = computed(() => {
  const name = props.name.trim()
  return name === '' ? '?' : name.charAt(0).toUpperCase()
})
</script>

<template>
  <span class="avatar" aria-hidden="true">{{ initial }}</span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-size: 14px;
  font-weight: 700;
}
</style>
