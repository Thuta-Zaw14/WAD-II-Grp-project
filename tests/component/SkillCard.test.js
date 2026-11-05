// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SkillCard from '../../src/components/SkillCard.vue'

const sampleSkill = {
  name: 'Tennis',
  category: 'Sports',
  courseTitle: 'Beginner Tennis',
  sessionDurationMinutes: 60,
  subskills: ['Serving', 'Footwork'],
  issuer: 'Alex Tan',
  dateAttained: '2026-11-05',
}

describe('SkillCard Component', () => {
  it('displays the skill name and category', () => {
    const wrapper = mount(SkillCard, {
      props: { skill: sampleSkill },
    })

    expect(wrapper.find('.achievement-title').text()).toBe('Tennis')
    expect(wrapper.find('.achievement-type').text()).toBe('Sports')
  })

  it('displays the course title and lesson duration', () => {
    const wrapper = mount(SkillCard, {
      props: { skill: sampleSkill },
    })

    expect(wrapper.text()).toContain('Beginner Tennis')
    expect(wrapper.text()).toContain('60-minute lesson')
  })

  it('displays the subskills learned', () => {
    const wrapper = mount(SkillCard, {
      props: { skill: sampleSkill },
    })

    const tags = wrapper.findAll('.subskill-tag')
    expect(tags).toHaveLength(2)
    expect(tags[0].text()).toBe('Serving')
    expect(tags[1].text()).toBe('Footwork')
  })

  it('displays the issuer and their initials', () => {
    const wrapper = mount(SkillCard, {
      props: { skill: sampleSkill },
    })

    expect(wrapper.find('.issuer-avatar').text()).toBe('AT')
    expect(wrapper.text()).toContain('Alex Tan')
  })

  it('formats the attained date correctly', () => {
    const wrapper = mount(SkillCard, {
      props: { skill: sampleSkill },
    })

    expect(wrapper.find('.date-info .footer-value').text())
      .toBe('5 Nov 2026')
  })

  it('handles missing optional information', () => {
    const wrapper = mount(SkillCard, {
      props: {
        skill: { name: 'Photography' },
      },
    })

    expect(wrapper.text()).toContain('Achievement')
    expect(wrapper.text()).toContain('No subskills recorded.')
    expect(wrapper.text()).toContain('Unknown issuer')
    expect(wrapper.text()).toContain('Date unavailable')
  })

  it('rejects an invalid attained date', () => {
    const wrapper = mount(SkillCard, {
      props: {
        skill: {
          ...sampleSkill,
          dateAttained: '2026-02-30',
        },
      },
    })

    expect(wrapper.text()).toContain('Date unavailable')
  })
})
