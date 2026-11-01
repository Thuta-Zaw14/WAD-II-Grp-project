import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getOffers, errorText } from '../services/api'

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
      error.value = 'Could not load skills: ' + errorText(err)
    }
    loading.value = false
  }

  // swap in one fresh copy of a course, e.g. after a booking changed its seat count
  function replaceOffer(updated) {
    offers.value = offers.value.map((o) => (o.id === updated.id ? updated : o))
  }

  // forget everything, e.g. when someone logs out (each offer says which slots are "mine")
  function reset() {
    offers.value = []
    error.value = ''
  }

  return { offers, loading, error, fetchOffers, replaceOffer, reset }
})
