import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getProgress, errorText } from '../services/api'

// The Progress page's data (homework, feedback, mastery) and the red number on "Progress" in
// the nav bar: homework I still have to do or have news on, plus work waiting for me to grade.
export const useProgressStore = defineStore('progress', () => {
  const overview = ref(null) // { learning: { courses, assignments }, teaching: { courses, toReview }, counts }
  const loading = ref(false)
  const error = ref('')

  // reset() bumps this, so an answer started for the previous person is thrown away
  let generation = 0

  const learning = computed(() => (overview.value ? overview.value.learning : { courses: [], assignments: [] }))
  const teaching = computed(() => (overview.value ? overview.value.teaching : { courses: [], toReview: [] }))
  const attentionCount = computed(() =>
    overview.value ? overview.value.counts.learning + overview.value.counts.teaching : 0
  )

  async function fetchOverview() {
    const started = generation
    loading.value = true
    error.value = ''
    try {
      const data = await getProgress()
      if (started !== generation) return
      overview.value = data
    } catch (err) {
      if (started !== generation) return
      error.value = 'Could not load your progress: ' + errorText(err)
    }
    loading.value = false
  }

  // the same, but quiet (no "Loading...", no error): keeps the nav bar number fresh
  async function refreshOverview() {
    const started = generation
    try {
      const data = await getProgress()
      if (started === generation) overview.value = data
    } catch {
      // only a hint: keep what we had and try again next time
    }
  }

  function reset() {
    generation++
    overview.value = null
    loading.value = false
    error.value = ''
  }

  return { overview, loading, error, learning, teaching, attentionCount, fetchOverview, refreshOverview, reset }
})
