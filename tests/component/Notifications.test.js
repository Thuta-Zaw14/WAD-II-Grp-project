// Component testing for notifications pop up on MyClasses page
// Places where notif may show up: Nav Bar, "Classes I Am Attending", "Classes I Am Hosting"
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

// fake login 
vi.mock('@/firebase', () => ({ auth: { currentUser: { uid: 'me' }, authStateReady: () => Promise.resolve() } }))
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }))

// the fake server: `server.bookings` is what "my bookings" returns in each test
const server = vi.hoisted(() => ({ bookings: [] }))
const dismissBookingNotice = vi.hoisted(() => vi.fn(async (id) => ({ booking: { id, notice: null } })))
vi.mock('@/services/api', () => ({
  getMyBookings: async () => server.bookings,
  getMe: async () => ({ name: 'Me', credits: 2, skillsTeach: [], skillsLearn: [] }),
  getMyReports: async () => [],
  dismissBookingNotice,
  errorText: (err) => String(err),
}))

import NavBar from '@/components/NavBar.vue'
import CancelNotices from '@/components/CancelNotices.vue'

// a booking as the server sends it; `role` says whether I am the student or the instructor in it
function booking(role, extra = {}) {
  return {
    id: 'booking-1',
    role,
    offerId: 'course-1',
    title: 'Tap Dancing',
    teacherName: 'Alex',
    learnerName: 'Sam',
    status: 'booked',
    startsAt: '2026-11-10T06:00:00.000Z',
    creditCost: 2,
    stageProgress: [{ stageName: 'Basics', reflection: '', approved: false, rejected: false }],
    unreadCount: 0,
    newApprovals: 0,
    newStudent: false,
    notice: null,
    ...extra,
  }
}

const moved = { from: '2026-11-10T06:00:00.000Z', to: '2026-11-12T08:00:00.000Z', at: '2026-11-06T01:00:00.000Z' }

let wrapper = null

// the nav bar and the notice box together, as on the Home page
async function openPageWith(bookings) {
  server.bookings = bookings
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }] })
  router.push('/home')
  await router.isReady()
  wrapper = mount({ components: { NavBar, CancelNotices }, template: '<div><NavBar /><CancelNotices /></div>' }, {
    global: { plugins: [router] },
  })
  await flushPromises() // the nav bar loads my bookings
  return wrapper
}

// the red number on the "My Classes" link ('' when there is none)
function myClassesCount(page) {
  const link = page.findAll('a').find((a) => a.text().includes('My Classes'))
  const badge = link.find('.nav-count')
  return badge.exists() ? badge.text().replace(/\D/g, '') : ''
}

describe('notifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    dismissBookingNotice.mockClear()
  })
  afterEach(() => {
    if (wrapper) wrapper.unmount() // stops the nav bar's refresh timer
    wrapper = null
  })

  it('nothing new: no red number and no notice', async () => {
    const page = await openPageWith([booking('teacher')])
    expect(myClassesCount(page)).toBe('')
    expect(page.find('.cancel-notice').exists()).toBe(false)
  })

  // ----- the instructor's side -----
  it('3a: 1 student joins class, so instructor gets a red 1', async () => {
    const page = await openPageWith([booking('teacher', { newStudent: true })])
    expect(myClassesCount(page)).toBe('1')
  })

  it('3b: 1 student sends a reflection, so instructor get a red 1 until reviewed', async () => {
    const page = await openPageWith([
      booking('teacher', { stageProgress: [{ stageName: 'Basics', reflection: 'I learned the basic steps.', approved: false, rejected: false }] }),
    ])
    expect(myClassesCount(page)).toBe('1')
  })

  it('3c: 1 student reschedules, so I see a red 1 and the new time', async () => {
    const page = await openPageWith([booking('teacher', { notice: { type: 'moved', ...moved } })])
    expect(page.text()).toContain('Sam moved Tap Dancing')
    expect(page.find('.cancel-notice').text()).toMatch(/From .+ to .+/)
    expect(myClassesCount(page)).toBe('1')
  })

  // ----- the student's side -----
  it('3d: the instructor reschedules, so the student sees when it now starts', async () => {
    const page = await openPageWith([booking('learner', { notice: { type: 'teacherMoved', note: 'Sorry, the hall is booked', ...moved } })])
    expect(page.text()).toContain('Alex moved Tap Dancing')
    expect(page.text()).toContain('It now starts')
    expect(page.text()).toContain('Sorry, the hall is booked')
    expect(myClassesCount(page)).toBe('1')
  })

})
