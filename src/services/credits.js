// A COPY of the credit rules in server/config/credits.js, used only to show the
// live "Students are charged..." preview on the teach form. The server works out
// the real numbers when the course is saved and ignores anything sent from here,
// so if you change a rule, change it in BOTH files.
export const MAX_STAGES = 12
export const BONUS_MIN_STAGES = 4
export const BONUS_STAGE_INTERVAL = 5

export function calcCreditCost({ mode, equipmentOption }) {
  return 1 + (mode === 'physical' && equipmentOption === 'provided' ? 1 : 0)
}

export function calcCompletionCredits({ stageCount, lessonsPerWeek, equipmentOption, difficulty }) {
  const stageCredits = stageCount >= BONUS_MIN_STAGES
    ? 1 + Math.floor((stageCount - BONUS_MIN_STAGES) / BONUS_STAGE_INTERVAL)
    : 0

  return 1 + stageCredits +
    (lessonsPerWeek >= 2 ? 1 : 0) +
    (equipmentOption === 'bring' ? 1 : 0) +
    (difficulty === 'high_risk' ? 1 : 0)
}
