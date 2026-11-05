// COMPONENT TEST 2: SkillSearch.vue, the search box on the Courses page.
// The component is mounted on its own. We type, press keys and click like a user, then check
// the suggestions on screen and the event ("update:modelValue") it sends to its parent page.
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SkillSearch from '../../src/components/SkillSearch.vue'

const skills = [
  { skill: 'Guitar', category: 'Music' },
  { skill: 'Guitar', category: 'Music' }, // a second teacher of the same skill
  { skill: 'Tennis', category: 'Sports' },
]

// The parent page keeps the typed text and passes it in as the "modelValue" prop.
function showSearch(typedText) {
  return mount(SkillSearch, { props: { modelValue: typedText, skills: skills } })
}

describe('SkillSearch', () => {
  it('shows no suggestions while the box is empty', async () => {
    const wrapper = showSearch('')
    await wrapper.find('input').trigger('focus')
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it('suggests a matching skill once, with how many teachers it has', async () => {
    const wrapper = showSearch('guit')
    await wrapper.find('input').trigger('focus')
    expect(wrapper.findAll('li')).toHaveLength(1)
    expect(wrapper.text()).toContain('Guitar')
    expect(wrapper.text()).toContain('2 teachers')
  })

  it('still finds a skill when the word is spelt a little wrong', async () => {
    const wrapper = showSearch('tenis')
    await wrapper.find('input').trigger('focus')
    expect(wrapper.text()).toContain('Tennis')
  })

  it('suggests nothing for text that matches no skill', async () => {
    const wrapper = showSearch('zzzzqq')
    await wrapper.find('input').trigger('focus')
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it('tells the parent what was typed', async () => {
    const wrapper = showSearch('')
    await wrapper.find('input').setValue('ten')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['ten'])
  })

  it('fills in the skill name when a suggestion is clicked', async () => {
    const wrapper = showSearch('guit')
    await wrapper.find('input').trigger('focus')
    await wrapper.find('li').trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['Guitar'])
  })

  it('picks the top suggestion when Enter is pressed', async () => {
    const wrapper = showSearch('ten')
    await wrapper.find('input').trigger('focus')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['Tennis'])
  })
})
