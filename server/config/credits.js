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

// ---------- Invite a friend ----------
// The one place credits ARE created: a small, capped reward. When a person who was invited
// finishes their FIRST course, the person who invited them is paid. Each person can be
// rewarded for at most MAX_REFERRAL_REWARDS friends. The friend already starts with 2 credits,
// so they get nothing extra by default (set REFERRAL_REWARD_FRIEND to 1 to change that).
export const MAX_REFERRAL_REWARDS = 2
export const REFERRAL_REWARD_INVITER = 1
export const REFERRAL_REWARD_FRIEND = 0
