import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  createProfile, getMe, updateProfile, getMySkillCards, getOptions, getMyOffers, getMyGoals, errorText,
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
  const coursesLoaded = ref(false) // false until fetchMyCourses has worked once, so a failed load is not shown as "no courses"

  // reset() bumps this. A request that was started before the bump belongs to the previous person
  // (e.g. it was still on its way when they logged out), so its answer is thrown away.
  let generation = 0

  // getter: used by the home page and the profile page, so it lives here
  const credits = computed(() => (profile.value ? profile.value.credits : 0))

  // actions
  async function fetchProfile() {
    const started = generation
    loading.value = true
    error.value = ''
    try {
      const me = await getMe()
      if (started !== generation) return
      profile.value = me
    } catch (err) {
      if (started !== generation) return
      if (err.response && err.response.status === 404) {
        // No profile yet (a brand-new account): create it
        try {
          const created = await createProfile()
          if (started !== generation) return
          profile.value = created
        } catch (err2) {
          if (started !== generation) return
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
    const started = generation
    try {
      const cards = await getMySkillCards()
      if (started === generation) skillCards.value = cards
    } catch (err) {
      console.error('Could not load skill cards:', errorText(err))
    }
  }

  // the courses I teach and the skills I want to learn (the profile page and both forms use them)
  async function fetchMyCourses() {
    const started = generation
    try {
      const [offers, goals] = await Promise.all([getMyOffers(), getMyGoals()])
      if (started !== generation) return
      myOffers.value = offers
      myGoals.value = goals
      coursesLoaded.value = true
    } catch (err) {
      if (started !== generation) return
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

  // forget everything, e.g. when someone logs out
  function reset() {
    generation++
    profile.value = null
    loading.value = false
    coursesLoaded.value = false
    skillCards.value = []
    myOffers.value = []
    myGoals.value = []
    error.value = ''
    saveError.value = ''
  }

  return {
    profile, categories, regions, knownSkills, skillCards, myOffers, myGoals, coursesLoaded, loading, saving, error, saveError,
    credits,
    fetchProfile, fetchOptions, fetchSkillCards, fetchMyCourses, saveProfile, reset,
  }
})
