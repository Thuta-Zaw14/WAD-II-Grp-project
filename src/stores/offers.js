import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getOffers } from '../services/api'

export const useOffersStore = defineStore('offers', () => {
  // state
  const offers = ref([])
  const loading = ref(false)
  const error = ref('')

  // action
  async function fetchOffers() {
    loading.value = true
    error.value = ''
    try {
      offers.value = await getOffers()
    } catch (err) {
      error.value = 'Could not load skills: ' + err.message
    }
    loading.value = false
  }

  return { offers, loading, error, fetchOffers }
})