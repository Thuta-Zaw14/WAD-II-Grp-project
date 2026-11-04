import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getMyReports } from '../services/api'

// How many of my reports have news from an admin I have not opened yet: the red number on
// "Report" in the nav bar. The Reports page asks for a fresh count after opening a report.
export const useReportsStore = defineStore('reports', () => {
  const newsCount = ref(0)

  // reset() bumps this, so an answer started for the previous person is thrown away
  let generation = 0

  async function refreshNews() {
    const started = generation
    try {
      const mine = await getMyReports()
      if (started !== generation) return
      newsCount.value = mine.filter((report) => report.hasNews).length
    } catch {
      // the nav bar number is only a hint: keep the last count and try again next time
    }
  }

  function reset() {
    generation++
    newsCount.value = 0
  }

  return { newsCount, refreshNews, reset }
})
