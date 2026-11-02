// A COPY of the name checks in server/models/skillRules.js, so the forms can show
// the message straight away. The server checks again when saving, so if you change
// a rule, change it in BOTH files.

// ---------- Small helpers (plain loops, no regular expressions) ----------

const lowerLetters = 'abcdefghijklmnopqrstuvwxyz'
const digits = '0123456789'
const skillNameSymbols = ' .+#&\'/-' // so C++, C#, Node.js, R&B and A/B testing all work

// "Photo   editing " -> "Photo editing"
export function squeezeSpaces(text) {
  const words = []
  for (const word of text.split(' ')) {
    if (word !== '') {
      words.push(word)
    }
  }
  return words.join(' ')
}

// The most times one character appears in a row, ignoring capitals.
// "Bookkeeping" -> 2 (oo, kk, ee), "aaaa" -> 4
function longestRun(text) {
  const lower = text.toLowerCase()
  let longest = 0
  let current = 0
  for (let i = 0; i < lower.length; i++) {
    if (i > 0 && lower[i] === lower[i - 1]) {
      current++
    } else {
      current = 1
    }
    if (current > longest) {
      longest = current
    }
  }
  return longest
}

// True if the text has at least one letter. A character counts as a letter if it
// changes when made lower/upper case (a-z, accented letters), or is not plain
// English at all (e.g. Chinese), so titles in other languages are fine.
function hasLetter(text) {
  for (const ch of text) {
    if (ch.toLowerCase() !== ch.toUpperCase() || ch.charCodeAt(0) > 127) {
      return true
    }
  }
  return false
}

// Checks the name of a skill, e.g. "Tennis". Returns an error message, or '' if fine.
// These rules only catch obvious junk ("f", "123", "aaaa"). Nothing can prove that
// a typed name is a real skill, which is why the profile page also suggests real ones.
export function findSkillNameProblem(name) {
  const clean = squeezeSpaces(name) // extra spaces are tidied when saving, so ignore them here
  const lower = clean.toLowerCase()

  if (clean.length < 3) {
    return 'A skill name must be at least 3 characters.'
  }

  // only English letters, numbers, spaces and a few symbols
  const allowed = lowerLetters + digits + skillNameSymbols
  for (const ch of lower) {
    if (!allowed.includes(ch)) {
      return "A skill name can only use English letters, numbers, spaces and . + # & ' / -"
    }
  }

  let letterFound = false
  for (const ch of lower) {
    if (lowerLetters.includes(ch)) {
      letterFound = true
    }
  }
  if (!letterFound) {
    return 'A skill name needs letters.'
  }

  // the same character three times in a row: "aaa", "hhhh"
  if (longestRun(clean) >= 3) {
    return '"' + clean + '" does not look like a real skill name.'
  }
  return ''
}

// Checks a course or goal title, e.g. "Tennis for beginners". Looser than a skill name.
export function findTitleProblem(title) {
  const clean = squeezeSpaces(title)

  if (clean.length < 3) return 'The title must be at least 3 characters.'
  if (clean.length > 60) return 'The title must be 60 characters or fewer.'
  if (!hasLetter(clean)) return 'The title needs some letters.'
  if (longestRun(clean) >= 4) return 'That title does not look right. Please check it.'
  return ''
}
