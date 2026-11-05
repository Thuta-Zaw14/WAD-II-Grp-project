// COMPONENT TEST 2: SubmissionReview, the instructor's grading box under a student's work.
// It is mounted on its own; we click it like an instructor and check what it shows and what it
// tells the page (the 'grade' and 'redo' events). No server is involved: sending the grade is
// the page's job, so here we only check the events carry the right data.
// Run: pnpm exec vitest run tests/component/SubmissionReview.test.js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SubmissionReview from '../../src/components/progress/SubmissionReview.vue'

function mountReview(submission = { status: 'submitted' }) {
  return mount(SubmissionReview, { props: { submission } })
}

const find = (wrapper, id) => wrapper.find('[data-testid="' + id + '"]')

describe('SubmissionReview', () => {
  it('will not save a grade without stars, and says why', async () => {
    const wrapper = mountReview()
    await wrapper.find('form').trigger('submit')
    expect(find(wrapper, 'review-error').text()).toBe('Pick 1 to 5 stars first.')
    expect(wrapper.emitted('grade')).toBeUndefined()
  })

  it('sends the stars and the feedback (trimmed) when the grade is saved', async () => {
    const wrapper = mountReview()
    await find(wrapper, 'star-4').trigger('click')
    expect(find(wrapper, 'star-4').attributes('aria-checked')).toBe('true')
    await find(wrapper, 'review-feedback').setValue('  Great footwork!  ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('grade')).toEqual([[{ stars: 4, feedback: 'Great footwork!' }]])
  })

  it('asks for a redo only with a note saying what to change', async () => {
    const wrapper = mountReview()
    await find(wrapper, 'mode-redo').trigger('click')
    await wrapper.find('form').trigger('submit')
    expect(find(wrapper, 'review-error').text()).toBe('Tell the student what to change.')
    expect(wrapper.emitted('redo')).toBeUndefined()

    await find(wrapper, 'review-redo-note').setValue('Film from the side, please.')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('redo')).toEqual([[{ note: 'Film from the side, please.' }]])
  })

  it('starts from the existing grade when changing it, and no longer offers a redo', () => {
    const wrapper = mountReview({ status: 'reviewed', stars: 3, feedback: 'Good start' })
    expect(find(wrapper, 'star-3').attributes('aria-checked')).toBe('true')
    expect(find(wrapper, 'review-feedback').element.value).toBe('Good start')
    expect(find(wrapper, 'save-grade').text()).toBe('Update grade')
    expect(find(wrapper, 'mode-redo').exists()).toBe(false)
  })

  it('shows a waiting message instead of the form while a redo is pending', () => {
    const wrapper = mountReview({ status: 'redo', redoNote: 'Show both hands' })
    expect(find(wrapper, 'review-waiting').text()).toContain('Show both hands')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
