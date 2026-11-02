<script setup>
import ToastMessage from './components/ToastMessage.vue'
</script>

<template>
  <!-- keyed by path, so going from /teach/a to /teach/new (same page, new :id) loads it afresh -->
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" :key="route.path" />
  </RouterView>
  <!-- the short "Saved" style messages, shown on top of whatever page is open -->
  <ToastMessage />
</template>

<style>
body {
  margin: 0;
}
</style>
