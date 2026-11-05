// A COPY of the credit rule in server/config/credits.js, used only to show the
// live "Students are charged..." preview on the teach form. The server works out the
// real price when the course is saved and ignores anything sent from here, so if you
// change a rule, change it in BOTH files.
export const MAX_STAGES = 12

export function calcCreditCost({ mode, equipmentOption }) {
  return 1 + (mode === 'physical' && equipmentOption === 'provided' ? 1 : 0)
}
