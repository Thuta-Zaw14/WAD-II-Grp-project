import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { createProfile, getMe, updateProfile, getMySkillCards, getOptions } from '../services/api'

// The server sends a helpful message when it says no (e.g. "Please enter your name.")
function errorText(err) {
  if (err.response && err.response.data && err.response.data.error) {
    return err.response.data.error
  }
  return err.message
}

export const useProfileStore = defineStore('profile', () => {
  // state
  const profile = ref(null)
  const categories = ref([]) // the genres a skill can be filed under, e.g. 'Sports'
  const regions = ref([])
  const skillCards = ref([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const saveError = ref('')

  // getter: used by the home page and the profile page, so it lives here
  const credits = computed(() => (profile.value ? profile.value.credits : 0))

  // actions
  async function fetchProfile() {
    loading.value = true
    error.value = ''
    try {
      profile.value = await getMe()
    } catch (err) {
      if (err.response && err.response.status === 404) {
        // No profile yet (a brand-new account): create it
        try {
          profile.value = await createProfile()
        } catch (err2) {
          error.value = 'Could not set up your profile: ' + errorText(err2)
        }
      } else {
        error.value = 'Could not load your profile: ' + errorText(err)
      }
    }
    loading.value = false
  }

  async function fetchOptions() {
    if (categories.value.length > 0) return // the lists never change while the app runs
    try {
      const options = await getOptions()
      categories.value = options.categories
      regions.value = options.regions
    } catch (err) {
      error.value = 'Could not load the genre list: ' + errorText(err)
    }
  }

  async function fetchSkillCards() {
    try {
      skillCards.value = await getMySkillCards()
    } catch (err) {
      console.error('Could not load skill cards:', errorText(err))
    }
  }

  // returns true if saved, false if not (the reason is in saveError)
  async function saveProfile(changes) {
    saving.value = true
    saveError.value = ''
    try {
      profile.value = await updateProfile(changes)
      saving.value = false
      return true
    } catch (err) {
      saveError.value = errorText(err)
      saving.value = false
      return false
    }
  }

  // forget everything, e.g. when someone logs out
  function reset() {
    profile.value = null
    skillCards.value = []
    error.value = ''
    saveError.value = ''
  }

  return {
    profile, categories, regions, skillCards, loading, saving, error, saveError,
    credits,
    fetchProfile, fetchOptions, fetchSkillCards, saveProfile, reset,
  }
})