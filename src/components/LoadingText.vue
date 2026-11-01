<script setup>
// A small spinning circle with a line of text, shown while something loads
defineProps({
  text: { type: String, default: 'Loading...' },
})
</script>

<template>
  <p class="text-muted d-flex align-items-center gap-2" role="status">
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
    {{ text }}
  </p>
</template>
