// COMPONENT TEST 1: AssignmentCard, one piece of homework in the student's list on Progress.
// It is mounted on its own with fixed data and a fixed time ("now"), then we check what it shows:
// the status label, the time left, the stars and the button. RouterLink is replaced by
// RouterLinkStub, so no router is needed (the test only checks where the button points).
// Run: pnpm exec vitest run tests/component/AssignmentCard.test.js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import AssignmentCard from '../../src/components/progress/AssignmentCard.vue'

const HOUR = 60 * 60 * 1000
const now = new Date('2026-11-06T12:00:00+08:00')
const inHours = (hours) => new Date(now.getTime() + hours * HOUR).toISOString()

function mountCard(changes = {}) {
  const assignment = {
    id: 'hw1',
    title: 'Practise your serve 20 times',
    courseTitle: 'Badminton Basics',
    category: 'Sports',
    teacherName: 'Jamie Tan',
    dueAt: inHours(72),
    canSubmit: true,
    missed: false,
    submission: null,
    ...changes,
  }
  return mount(AssignmentCard, {
    props: { assignment, now },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

const status = (wrapper) => wrapper.get('[data-testid="assignment-status"]').text()
const action = (wrapper) => wrapper.getComponent(RouterLinkStub)

describe('AssignmentCard', () => {
  it('shows a new assignment as "To do" with the time left and a Submit button', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Practise your serve 20 times')
    expect(wrapper.text()).toContain('Set by Jamie Tan')
    expect(status(wrapper)).toBe('To do')
    expect(wrapper.get('[data-testid="assignment-due"]').text()).toContain('Due in 3 days')
    expect(action(wrapper).text()).toBe('Submit work')
    expect(action(wrapper).props('to')).toBe('/progress/assignments/hw1')
  })

  it('warns when the due date is less than 2 days away', () => {
    const wrapper = mountCard({ dueAt: inHours(5) })
    expect(status(wrapper)).toBe('Due soon')
    expect(wrapper.get('[data-testid="assignment-due"]').classes()).toContain('text-danger')
    expect(wrapper.get('[data-testid="assignment-card"]').classes()).toContain('urgent')
  })

  it('is "Missed" after the due date with nothing sent, and only offers View', () => {
    const wrapper = mountCard({ dueAt: inHours(-24), canSubmit: false, missed: true })
    expect(status(wrapper)).toBe('Missed')
    expect(wrapper.get('[data-testid="assignment-due"]').text()).toContain('Closed 1 day ago')
    expect(action(wrapper).text()).toBe('View')
  })

  it('shows the stars and the "New feedback" dot once the work is graded', () => {
    const wrapper = mountCard({
      dueAt: inHours(-24),
      canSubmit: false,
      submission: { status: 'reviewed', stars: 4, submittedAt: inHours(-30), news: true },
    })
    expect(status(wrapper)).toBe('Graded')
    expect(wrapper.get('[data-testid="star-display"]').attributes('aria-label')).toBe('4 out of 5 stars')
    expect(wrapper.find('[data-testid="assignment-news"]').exists()).toBe(true)
  })

  it('asks for a redo, with the redo time left, when the instructor sent it back', () => {
    const wrapper = mountCard({
      submission: { status: 'redo', redoUntil: inHours(48), submittedAt: inHours(-2), news: false },
    })
    expect(status(wrapper)).toBe('Redo requested')
    expect(wrapper.get('[data-testid="assignment-due"]').text()).toContain('Redo due in 2 days')
    expect(action(wrapper).text()).toBe('Redo work')
  })
})
