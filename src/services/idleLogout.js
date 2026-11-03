import { reactive } from 'vue'
import { IDLE_WARNING_MINUTES, IDLE_LOGOUT_MINUTES } from '../config'

// Logs people out when they walk away. While someone is logged in we remember when they last
// clicked, typed, scrolled or touched the page. After IDLE_WARNING_MINUTES the "Still there?"
// box shows (IdleWarning.vue); after IDLE_LOGOUT_MINUTES they are logged out.
//
// The time is kept in localStorage, so it is shared by every tab: working in one tab keeps the
// others logged in too. It also survives a closed browser, so someone who comes back after a
// long break is logged out straight away instead of finding the site still open.
//
// Moving the mouse alone does not count, so the box stays until they actually click.

const STORAGE_KEY = 'lastActivity'
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart']
const MINUTE = 60 * 1000

// what the warning box shows
export const idleState = reactive({
  warning: false, // true once the warning time has passed
  secondsLeft: 0, // until the logout
})

// set by startIdleWatch; the shorter times are only used by tests
let warnAfter = IDLE_WARNING_MINUTES * MINUTE
let logoutAfter = IDLE_LOGOUT_MINUTES * MINUTE
let onIdleLogout = null
let timer = null
let lastSaved = 0

function readLastActivity() {
  const saved = Number(localStorage.getItem(STORAGE_KEY))
  return Number.isFinite(saved) && saved > 0 ? saved : 0
}

// Call this right before logging in, so an old time left from last week
// does not log the person straight back out.
export function markActive() {
  lastSaved = Date.now()
  localStorage.setItem(STORAGE_KEY, String(lastSaved))
  idleState.warning = false
}

// activity happens many times a second while scrolling, so save it at most once a second
function onActivity() {
  if (Date.now() - lastSaved < 1000 && !idleState.warning) return
  markActive()
}

function check() {
  const last = readLastActivity()
  if (last === 0) {
    markActive() // nothing saved yet: count from now
    return
  }
  const idleFor = Date.now() - last
  if (idleFor >= logoutAfter) {
    const logout = onIdleLogout
    stopIdleWatch()
    if (logout) logout()
    return
  }
  idleState.warning = idleFor >= warnAfter
  idleState.secondsLeft = Math.ceil((logoutAfter - idleFor) / 1000)
}

function onVisibilityChange() {
  if (!document.hidden) check() // e.g. the laptop just woke up
}

// options: { onLogout, warnAfterMs, logoutAfterMs } (the last two only for tests)
export function startIdleWatch(options) {
  stopIdleWatch()
  onIdleLogout = options.onLogout
  warnAfter = options.warnAfterMs || IDLE_WARNING_MINUTES * MINUTE
  logoutAfter = options.logoutAfterMs || IDLE_LOGOUT_MINUTES * MINUTE

  for (const name of ACTIVITY_EVENTS) {
    window.addEventListener(name, onActivity, { passive: true, capture: true })
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  check() // straight away: they may have been gone for hours
  timer = setInterval(check, 1000) // every second, so the countdown in the box stays right
}

export function stopIdleWatch() {
  clearInterval(timer)
  timer = null
  onIdleLogout = null
  for (const name of ACTIVITY_EVENTS) {
    window.removeEventListener(name, onActivity, { capture: true })
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  idleState.warning = false
}
