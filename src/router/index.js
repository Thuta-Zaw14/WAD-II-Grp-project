import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../view/LoginPage.vue'
import HomePage from '../view/HomePage.vue'
import SessionsPage from '../view/SessionsPage.vue'
import ChatPage from '../view/ChatPage.vue'
import DiscussionPage from '../view/DiscussionPage.vue'
import InsightsPage from '@/view/Insightspage.vue'
import ProfilePage from '../view/ProfilePage.vue'
import TeachSkillPage from '../view/TeachSkillPage.vue'
import LearnSkillPage from '../view/LearnSkillPage.vue'
import AdminPage from '../view/AdminPage.vue'
import AdminUserProfilePage from '../view/AdminUserProfilePage.vue'
import { auth } from '../firebase'
import { checkAdmin } from '../services/api'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginPage },
    { path: '/home', component: HomePage },
    { path: '/sessions', component: SessionsPage },
    { path: '/chat/:id', component: ChatPage, props: true }, // the private chat of one booking
    { path: '/discussion/:id', component: DiscussionPage, props: true }, // the public discussion of one course
    { path: '/insights', component: InsightsPage },
    { path: '/profile', component: ProfilePage },
    // props: true hands the :id in the address to the page as a prop
    { path: '/teach/new', component: TeachSkillPage },
    { path: '/teach/:id', component: TeachSkillPage, props: true },
    { path: '/learn/new', component: LearnSkillPage },
    { path: '/learn/:id', component: LearnSkillPage, props: true },
    // only admins (meta.requiresAdmin is checked by the guard below)
    { path: '/admins', component: AdminPage, meta: { requiresAdmin: true } },
    { path: '/admins/users/:uid', component: AdminUserProfilePage, meta: { requiresAdmin: true } },
  ],
})

// Navigation guard: the admin pages are only opened for admins. Everyone else is sent home.
// This only decides which PAGE is shown. The real lock is on the server (verifyAdmin.js):
// even if someone got past this, every admin route there would still say no.
router.beforeEach(async (to) => {
  if (!to.meta.requiresAdmin) return true

  await auth.authStateReady() // wait until Firebase has restored the login
  if (!auth.currentUser) return '/login'

  try {
    const result = await checkAdmin()
    return result.isAdmin ? true : '/home'
  } catch (err) {
    return '/home'
  }
})

export default router