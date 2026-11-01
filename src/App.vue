<script setup>
import ToastMessage from './components/ToastMessage.vue'
</script>

<template>
  <RouterView />
  <!-- the short "Saved" style messages, shown on top of whatever page is open -->
  <ToastMessage />
</template>

<style>
body {
  margin: 0;
}
</style>
