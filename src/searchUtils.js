// Words we ignore when searching, so "beginner tennis lessons" is the same as "tennis"
const ignore = ['beginner', 'lessons', 'for']

// "Guitar basics" -> ["guitar", "basics"]
function splitWords(text) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

// How many letters you need to change to turn word a into word b
function editDistance(a, b) {
  const table = []
  for (let i = 0; i <= a.length; i++) table[i] = [i]
  for (let j = 1; j <= b.length; j++) table[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      table[i][j] = Math.min(
        table[i - 1][j] + 1, // delete a letter
        table[i][j - 1] + 1, // add a letter
        table[i - 1][j - 1] + cost // change a letter
      )
    }
  }
  return table[a.length][b.length]
}

// Does one typed word match one real word?
function wordMatches(typed, word) {
  if (word.startsWith(typed)) return true // "ten" matches "tennis"
  if (word.length >= 4 && typed.startsWith(word)) return true // "photography" matches "photo"

  // Spelling mistakes: short words must be exact, longer words can have 1 or 2 wrong letters
  if (typed.length < 4) return false
  const allowed = typed.length > 5 ? 2 : 1
  const start = word.slice(0, typed.length) // also check the start of the word, for half-typed words
  return editDistance(typed, word) <= allowed || editDistance(typed, start) <= allowed
}

// Does the search match the fields (skill name, teacher, category...)?
// Every typed word has to match at least one real word.
export function matches(search, fields) {
  const typedWords = splitWords(search).filter((w) => !ignore.includes(w))
  const realWords = splitWords(fields.join(' '))

  return typedWords.every((typed) => realWords.some((word) => wordMatches(typed, word)))
}