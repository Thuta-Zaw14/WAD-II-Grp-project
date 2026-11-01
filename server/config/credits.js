// The credit rules. The server is the only place that works out prices, so a
// browser can never send its own. (The teach form has a copy of this function in
// src/services/credits.js to show a live preview - if you change a rule here,
// change it there too.)
//
// Credits only MOVE between people, they are never created: a student pays this price
// when they book, it is held, and it goes to the teacher when both have confirmed the
// course is finished (see models/bookings.js). The student's reward is a skill card.
export const MAX_STAGES = 12

// what a student pays to book the course
export function calcCreditCost({ mode, equipmentOption }) {
  return 1 + (mode === 'physical' && equipmentOption === 'provided' ? 1 : 0)
}
