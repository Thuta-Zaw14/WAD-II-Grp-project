// The credit rules. The server is the only place that works out prices, so a
// browser can never send its own. (The teach form has a copy of these two
// functions in src/services/credits.js to show a live preview - if you change
// a rule here, change it there too.)
export const MAX_STAGES = 12
export const BONUS_MIN_STAGES = 4
export const BONUS_MIN_LESSONS_PER_WEEK = 2
export const BONUS_STAGE_INTERVAL = 5

// what a student pays to join the course
export function calcCreditCost({ mode, equipmentOption }) {
  return 1 + (mode === 'physical' && equipmentOption === 'provided' ? 1 : 0)
}

// what a student earns for finishing the course
export function calcCompletionCredits({ stageCount, lessonsPerWeek, equipmentOption, difficulty }) {
  const stageCredits = stageCount >= BONUS_MIN_STAGES
    ? 1 + Math.floor((stageCount - BONUS_MIN_STAGES) / BONUS_STAGE_INTERVAL)
    : 0

  return 1 + stageCredits +
    (lessonsPerWeek >= BONUS_MIN_LESSONS_PER_WEEK ? 1 : 0) +
    (equipmentOption === 'bring' ? 1 : 0) +
    (difficulty === 'high_risk' ? 1 : 0)
}
