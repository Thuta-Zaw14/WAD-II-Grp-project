import { useRouter } from 'vue-router'

// Where an add / edit page goes back to: the page you came from (e.g. Profile or My Classes),
// or `fallback` when the page was opened straight from an address. Used by the "Back to ..."
// button and after saving, cancelling or deleting. Call it in <script setup>, before the page
// navigates anywhere, so it still sees the page you came from.
const pageNames = {
  '/home': 'Home',
  '/profile': 'Profile',
  '/classes': 'My Classes',
  '/courses': 'Courses',
  '/reports': 'Reports',
}

export function usePreviousPage(fallback) {
  const router = useRouter()

  // vue-router keeps the address of the page before this one in history.state.back
  const state = window.history.state
  const previous = state && typeof state.back === 'string' ? state.back.split('?')[0] : ''
  const target = pageNames[previous] !== undefined ? previous : fallback

  return {
    label: 'Back to ' + pageNames[target],
    goBack: () => router.push(target),
  }
}
