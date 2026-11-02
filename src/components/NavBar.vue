<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useProfileStore } from '../stores/profile'
import { useOffersStore } from '../stores/offers'
import { useBookingsStore } from '../stores/bookings'
import LogoMark from './LogoMark.vue'

// The bar at the top of every page after login: the links, my credits and "Log out".
const route = useRoute()
const router = useRouter()
const profileStore = useProfileStore()
const offersStore = useOffersStore()
const bookingsStore = useBookingsStore()

// "paths" are the addresses where the link is highlighted, e.g. a chat belongs to My sessions
const links = [
  { label: 'Courses', to: '/home', paths: ['/home', '/discussion'] },
  { label: 'My sessions', to: '/sessions', paths: ['/sessions', '/chat'] },
  { label: 'Insights', to: '/insights', paths: ['/insights'] },
  { label: 'Profile', to: '/profile', paths: ['/profile', '/skills', '/teach', '/learn'] },
]

function isActive(link) {
  for (const path of link.paths) {
    if (route.path.startsWith(path)) return true
  }
  return false
}

const credits = computed(() => profileStore.credits)

onMounted(async () => {
  // some pages (the chat, the discussion) do not load the profile themselves, but the
  // credits come from it
  await auth.authStateReady()
  if (auth.currentUser && profileStore.profile === null && !profileStore.loading) {
    profileStore.fetchProfile()
  }
})

async function logout() {
  await signOut(auth)
  // forget the last person's data, so the next person to log in never sees it
  profileStore.reset()
  offersStore.reset()
  bookingsStore.reset()
  router.push('/login')
}
</script>

<template>
  <header class="top-bar sticky-top">
    <div class="container d-flex align-items-center flex-wrap gap-2 py-2">
      <RouterLink to="/home" class="brand d-flex align-items-center gap-2 text-decoration-none me-md-3">
        <LogoMark />
        <span class="brand-name">Kongsi</span>
      </RouterLink>

      <nav class="links d-flex gap-1" aria-label="Main">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="link"
          :class="{ active: isActive(link) }"
        >
          {{ link.label }}
        </RouterLink>
      </nav>

      <div class="ms-auto d-flex align-items-center gap-2">
        <small v-if="profileStore.profile" class="text-muted d-none d-xl-inline">{{ profileStore.profile.email }}</small>
        <span class="credit-pill" title="Your time credits">{{ credits }} credit{{ credits === 1 ? '' : 's' }}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="logout">Log out</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  background: var(--k-surface);
  border-bottom: 1px solid var(--k-border);
}

.brand-name {
  font-family: var(--k-font-heading);
  font-size: 22px;
  font-weight: 700;
  color: var(--k-accent);
}

.link {
  padding: 6px 12px;
  border-radius: 999px;
  color: var(--k-muted);
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}

.link:hover {
  color: var(--k-text);
  background: var(--k-surface-alt);
}

/* the page I am on */
.link.active {
  color: var(--k-accent);
  background: var(--k-surface-alt);
  font-weight: 600;
}

/* On a phone the links get their own row under the logo (order moves them to the end).
   If they still do not fit, the row scrolls sideways. */
.links {
  order: 3;
  width: 100%;
  overflow-x: auto;
}

@media (max-width: 767.98px) {
  .link {
    padding: 6px 9px;
    font-size: 15px;
  }
}

@media (min-width: 768px) {
  .links {
    order: 0;
    width: auto;
  }
}
</style>
