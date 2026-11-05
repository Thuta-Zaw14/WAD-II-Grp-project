// UNIT TEST: the search function used on the Courses page (src/searchUtils.js).
// matches(search, fields) says whether what the user typed matches a course's fields
// (skill name, category...). It is a plain function, so each test gives it an input and checks
// the answer: true or false.
import { describe, it, expect } from 'vitest'
import { matches } from '../../src/searchUtils.js'

describe('matches', () => {
  it('finds a skill typed in full', () => {
    expect(matches('guitar', ['Guitar', 'Music'])).toBe(true)
  })

  it('ignores capital letters', () => {
    expect(matches('GUITAR', ['guitar'])).toBe(true)
  })

  it('finds a skill from the first letters', () => {
    expect(matches('ten', ['Tennis'])).toBe(true)
  })

  it('also searches the other fields, such as the category', () => {
    expect(matches('music', ['Guitar', 'Music'])).toBe(true)
  })

  it('does not match a different skill', () => {
    expect(matches('piano', ['Guitar', 'Music'])).toBe(false)
  })

  it('forgives a small spelling mistake', () => {
    expect(matches('tenis', ['Tennis'])).toBe(true)
  })

  it('needs a short word to be exact', () => {
    expect(matches('tex', ['Tennis'])).toBe(false)
  })

  it('skips filler words such as "beginner" and "lessons"', () => {
    expect(matches('beginner tennis lessons', ['Tennis'])).toBe(true)
  })

  it('needs every typed word to match', () => {
    expect(matches('guitar piano', ['Guitar', 'Music'])).toBe(false)
  })

  it('matches everything when nothing is typed', () => {
    expect(matches('', ['Guitar'])).toBe(true)
  })
})
