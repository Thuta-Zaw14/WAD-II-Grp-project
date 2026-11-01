<template>
  <!-- two circles sharing a space: "kongsi" means "share" -->
  <svg class="logo" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
    <circle class="left" cx="12" cy="16" r="9" />
    <circle class="right" cx="20" cy="16" r="9" />
  </svg>
</template>

<style scoped>
.left {
  fill: var(--k-accent);
}

.right {
  fill: var(--k-brand);
  fill-opacity: 0.85;
}
</style>
