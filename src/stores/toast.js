import { ref } from 'vue'
import { defineStore } from 'pinia'

// A short message that pops up at the bottom of the screen and goes away by itself,
// e.g. "Booking cancelled." Any page or store can call show(). ToastMessage.vue draws it.
export const useToastStore = defineStore('toast', () => {
  const message = ref('')
  let timer = null

  function show(text) {
    message.value = text
    clearTimeout(timer) // a newer message replaces the old one and gets the full time
    timer = setTimeout(hide, 4000)
  }

  function hide() {
    message.value = ''
  }

  return { message, show, hide }
})
