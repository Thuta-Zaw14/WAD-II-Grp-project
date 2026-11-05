// COMPONENT TEST: EmptyState.vue, the friendly "nothing here" box the Courses page shows when
// no course is found (for example "No skills match your filters").
// The component is mounted on its own with props and a slot, and we check what the user reads.
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '../../src/components/EmptyState.vue'

describe('EmptyState', () => {
  it('shows the title', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No courses yet' } })
    expect(wrapper.text()).toContain('No courses yet')
  })

  it('shows the explanation text when there is one', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No courses yet', text: 'Be the first to teach something.' },
    })
    expect(wrapper.text()).toContain('Be the first to teach something.')
  })

  it('shows no explanation text when none is given', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No courses yet' } })
    expect(wrapper.findAll('p')).toHaveLength(1)
  })

  it('shows the icon when there is one', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No courses yet', icon: '🌱' } })
    expect(wrapper.text()).toContain('🌱')
  })

  it('shows a button that is put in the slot', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No skills match your filters' },
      slots: { default: '<button>Clear search and filters</button>' },
    })
    expect(wrapper.find('button').text()).toBe('Clear search and filters')
  })

  it('shows no button when nothing is put in the slot', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No courses yet' } })
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
