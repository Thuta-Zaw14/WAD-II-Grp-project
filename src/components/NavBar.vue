<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useProfileStore } from '../stores/profile'
import { useOffersStore } from '../stores/offers'
import { useBookingsStore } from '../stores/bookings'
import { useReportsStore } from '../stores/reports'
import { useProgressStore } from '../stores/progress'
import LogoMark from './LogoMark.vue'

// The bar at the top of every page after login: the links, my credits, and a menu
// under my name with Profile and Log out. On a phone the links fold into a ≡ menu.
const route = useRoute()
const router = useRouter()
const profileStore = useProfileStore()
const offersStore = useOffersStore()
const bookingsStore = useBookingsStore()
const reportsStore = useReportsStore()
const progressStore = useProgressStore()

// "paths" are the addresses where the link is highlighted, e.g. a chat belongs to My classes.
// "count" is the red number on the link: what is waiting for me on that page
// (My Classes: services/attention.js; Report: admin replies I have not opened yet).
const links = computed(() => [
  { label: 'Courses', to: '/courses', paths: ['/courses', '/discussion'], count: 0 },
  { label: 'My Classes', to: '/classes', paths: ['/classes', '/sessions', '/chat'], count: bookingsStore.attentionCount },
  // homework to do or with news, and work to grade (stores/progress.js)
  { label: 'Progress', to: '/progress', paths: ['/progress'], count: progressStore.attentionCount },
  { label: 'Insights', to: '/insights', paths: ['/insights'], count: 0 },
  { label: 'Report', to: '/reports', paths: ['/reports'], count: reportsStore.newsCount },
])

// what the red numbers say to a screen reader
function countLabel(link) {
  return link.to === '/reports' ? ' reports with news' : ' things waiting for you'
}

// the pages that belong to "Profile" in the menu under my name
const profilePaths = ['/profile', '/skills', '/teach', '/learn']

function startsWithAny(paths) {
  for (const path of paths) {
    if (route.path.startsWith(path)) return true
  }
  return false
}

function isActive(link) {
  return startsWithAny(link.paths)
}

const onProfilePage = computed(() => startsWithAny(profilePaths))

const credits = computed(() => profileStore.credits)

// ---------- Me: name and picture ----------
const displayName = computed(() => {
  const profile = profileStore.profile
  if (!profile) return ''
  return profile.name || profile.email || ''
})

const photo = computed(() => (profileStore.profile && profileStore.profile.photo) || '')

// "Jamie Tan" -> "JT", like the profile page
const initials = computed(() => {
  const words = displayName.value.trim().split(' ').filter((w) => w !== '')
  if (words.length === 0) return '?'
  let letters = words[0][0]
  if (words.length > 1) letters += words[words.length - 1][0]
  return letters.toUpperCase()
})

// ---------- The two menus ----------
const accountOpen = ref(false) // the menu under my name (computer)
const mobileOpen = ref(false) // the ≡ menu (phone)
const barEl = ref(null)

function closeMenus() {
  accountOpen.value = false
  mobileOpen.value = false
}

function toggleAccount() {
  accountOpen.value = !accountOpen.value
  mobileOpen.value = false
}

function toggleMobile() {
  mobileOpen.value = !mobileOpen.value
  accountOpen.value = false
}

// a click anywhere outside the bar closes the menus
function onDocumentClick(event) {
  if (barEl.value && !barEl.value.contains(event.target)) closeMenus()
}

function onKey(event) {
  if (event.key === 'Escape') closeMenus()
}

// going to another page closes them too
watch(() => route.path, closeMenus)

onMounted(async () => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKey)

  // some pages (the chat, the discussion) do not load the profile themselves, but the
  // credits and my name come from it
  await auth.authStateReady()
  if (!auth.currentUser) return
  if (profileStore.profile === null && !profileStore.loading) {
    profileStore.fetchProfile()
  }

  // the red numbers on My Classes and Report: load them on any page, and keep them fresh
  if (bookingsStore.bookings.length === 0 && !bookingsStore.loading) bookingsStore.fetchBookings()
  reportsStore.refreshNews()
  if (!progressStore.overview && !progressStore.loading) progressStore.refreshOverview()
  refreshTimer = setInterval(() => {
    if (document.hidden || !auth.currentUser) return
    bookingsStore.refreshBookings()
    reportsStore.refreshNews()
    // the Progress number reads more of the database, so only every 2 minutes (the free
    // Spark plan allows 50,000 reads a day); the Progress pages refresh it after every change
    ticks++
    if (ticks % 4 === 0) progressStore.refreshOverview()
  }, 30 * 1000)
})

let refreshTimer = null
let ticks = 0

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKey)
  clearInterval(refreshTimer)
})

async function logout() {
  closeMenus()
  await signOut(auth)
  // forget the last person's data, so the next person to log in never sees it
  profileStore.reset()
  offersStore.reset()
  bookingsStore.reset()
  reportsStore.reset()
  progressStore.reset()
  router.push('/')
}
</script>

<template>
  <header ref="barEl" class="top-bar sticky-top">
    <div class="container d-flex align-items-center gap-2 py-2">
      <RouterLink to="/home" class="brand d-flex align-items-center gap-2 text-decoration-none me-md-3">
        <LogoMark />
        <span class="brand-name">Kongsi</span>
      </RouterLink>

      <!-- Computer: the links in a row -->
      <nav class="links d-none d-md-flex gap-1" aria-label="Main">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="link"
          :class="{ active: isActive(link) }"
        >
          {{ link.label }}
          <span v-if="link.count > 0" class="nav-count">
            {{ link.count }}<span class="visually-hidden">{{ countLabel(link) }}</span>
          </span>
        </RouterLink>
      </nav>

      <div class="ms-auto d-flex align-items-center gap-2">
        <span class="credit-pill" title="Your time credits">{{ credits }} credit{{ credits === 1 ? '' : 's' }}</span>

        <!-- Computer: my name, with Profile and Log out underneath -->
        <div class="account d-none d-md-block">
          <button
            type="button"
            class="account-button"
            :class="{ active: onProfilePage }"
            aria-haspopup="true"
            :aria-expanded="accountOpen ? 'true' : 'false'"
            aria-controls="account-menu"
            @click="toggleAccount"
          >
            <img v-if="photo" :src="photo" alt="" class="avatar" />
            <span v-else class="avatar" aria-hidden="true">{{ initials }}</span>
            <span class="account-name">{{ displayName || 'Account' }}</span>
            <span class="caret" aria-hidden="true">&#9662;</span>
          </button>

          <div v-show="accountOpen" id="account-menu" class="menu menu-right">
            <RouterLink to="/profile" class="menu-item" :class="{ active: onProfilePage }">Profile</RouterLink>
            <button type="button" class="menu-item" @click="logout">Log out</button>
          </div>
        </div>

        <!-- Phone: one ≡ button for everything -->
        <button
          type="button"
          class="menu-toggle d-md-none"
          aria-label="Menu"
          :aria-expanded="mobileOpen ? 'true' : 'false'"
          aria-controls="mobile-menu"
          @click="toggleMobile"
        >
          <span aria-hidden="true">&#9776;</span>
        </button>
      </div>
    </div>

    <!-- Phone: the links, then me -->
    <nav v-show="mobileOpen" id="mobile-menu" class="mobile-menu d-md-none" aria-label="Main">
      <div class="container py-2">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="menu-item"
          :class="{ active: isActive(link) }"
        >
          {{ link.label }}
          <span v-if="link.count > 0" class="nav-count">
            {{ link.count }}<span class="visually-hidden">{{ countLabel(link) }}</span>
          </span>
        </RouterLink>

        <div class="mobile-me d-flex align-items-center gap-2 mt-2 pt-2">
          <img v-if="photo" :src="photo" alt="" class="avatar" />
          <span v-else class="avatar" aria-hidden="true">{{ initials }}</span>
          <span class="account-name">{{ displayName }}</span>
        </div>
        <RouterLink to="/profile" class="menu-item" :class="{ active: onProfilePage }">Profile</RouterLink>
        <button type="button" class="menu-item" @click="logout">Log out</button>
      </div>
    </nav>
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

/* the red number on a link: something on that page is waiting for me */
.nav-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--k-danger);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
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

/* ---------- Me ---------- */
.account {
  position: relative;
}

.account-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border: 1px solid var(--k-border);
  border-radius: 999px;
  background: var(--k-surface);
  color: var(--k-text);
  font-weight: 500;
}

.account-button:hover,
.account-button.active {
  background: var(--k-surface-alt);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-size: 12px;
  font-weight: 700;
}

.account-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret {
  font-size: 11px;
  color: var(--k-muted);
}

/* ---------- Menus ---------- */
.menu {
  position: absolute;
  top: calc(100% + 6px);
  min-width: 170px;
  padding: 6px;
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  border-radius: 12px;
  box-shadow: var(--k-shadow-lift);
  z-index: 1030;
}

.menu-right {
  right: 0;
}

.menu-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--k-text);
  text-align: left;
  text-decoration: none;
}

.menu-item:hover {
  background: var(--k-surface-alt);
}

.menu-item.active {
  color: var(--k-accent);
  background: var(--k-surface-alt);
  font-weight: 600;
}

.menu-toggle {
  width: 40px;
  height: 36px;
  border: 1px solid var(--k-border);
  border-radius: 10px;
  background: var(--k-surface);
  color: var(--k-text);
  font-size: 20px;
  line-height: 1;
}

.mobile-menu {
  border-top: 1px solid var(--k-border);
  background: var(--k-surface);
}

.mobile-me {
  border-top: 1px solid var(--k-border);
}

/* A tablet (the links are in a row, but the screen is narrow): with five links, the logo text
   and my name are hidden (the avatar stays) so the bar never runs off the screen. */
@media (min-width: 768px) and (max-width: 991.98px) {
  .brand-name,
  .account-name,
  .caret {
    display: none;
  }

  .link {
    padding: 6px 8px;
  }
}
</style>
