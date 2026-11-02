import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  createProfile, getMe, updateProfile, getMySkillCards, getOptions, getMyOffers, getMyGoals, addSlot, errorText,
} from '../services/api'

export const useProfileStore = defineStore('profile', () => {
  // state
  const profile = ref(null)
  const categories = ref([]) // the genres a skill can be filed under, e.g. 'Sports'
  const regions = ref([])
  const knownSkills = ref([]) // suggestions: [{ name: 'Tennis', category: 'Sports' }, ...]
  const skillCards = ref([])
  const myOffers = ref([]) // courses I teach
  const myGoals = ref([]) // skills I want to learn
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
      knownSkills.value = options.skills
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

  // the courses I teach and the skills I want to learn (the profile page and both forms use them)
  async function fetchMyCourses() {
    try {
      myOffers.value = await getMyOffers()
      myGoals.value = await getMyGoals()
    } catch (err) {
      error.value = 'Could not load your courses: ' + errorText(err)
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

  // Add a start time to one of my courses. Returns '' if it worked, or the reason it did not.
  async function addCourseSlot(offerId, date, time) {
    try {
      const updated = await addSlot(offerId, date, time)
      myOffers.value = myOffers.value.map((o) => (o.id === updated.id ? updated : o))
      return ''
    } catch (err) {
      return errorText(err)
    }
  }

  // forget everything, e.g. when someone logs out
  function reset() {
    profile.value = null
    skillCards.value = []
    myOffers.value = []
    myGoals.value = []
    error.value = ''
    saveError.value = ''
  }

  return {
    profile, categories, regions, knownSkills, skillCards, myOffers, myGoals, loading, saving, error, saveError,
    credits,
    fetchProfile, fetchOptions, fetchSkillCards, fetchMyCourses, saveProfile, addCourseSlot, reset,
  }
})
