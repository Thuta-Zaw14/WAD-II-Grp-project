import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../view/LoginPage.vue'
import LandingPage from '../view/LandingPage.vue'
import HomePage from '../view/HomePage.vue'
import CoursesPage from '../view/CoursesPage.vue'
import MyClassesPage from '../view/MyClassesPage.vue'
import ChatPage from '../view/ChatPage.vue'
import DiscussionPage from '../view/DiscussionPage.vue'
import InsightsPage from '@/view/Insightspage.vue'
import ReportsPage from '../view/ReportsPage.vue'
import ProgressPage from '../view/ProgressPage.vue'
import AssignmentPage from '../view/AssignmentPage.vue'
import ProfilePage from '../view/ProfilePage.vue'
import PublicProfilePage from '../view/PublicProfilePage.vue'
import SkillListPage from '../view/SkillListPage.vue'
import TeachSkillPage from '../view/TeachSkillPage.vue'
import LearnSkillPage from '../view/LearnSkillPage.vue'
import AdminPage from '../view/AdminPage.vue'
import AdminUserProfilePage from '../view/AdminUserProfilePage.vue'
import NotFoundPage from '../view/NotFoundPage.vue'
import { auth } from '../firebase'
import { checkAdmin, errorText } from '../services/api'
import { useToastStore } from '../stores/toast'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: LandingPage, meta: { public: true } },
    { path: '/login', component: LoginPage, meta: { public: true } },
    { path: '/home', component: HomePage },
    { path: '/courses', component: CoursesPage },
    { path: '/classes', component: MyClassesPage },
    { path: '/sessions', redirect: '/classes' }, // the old name of My classes
    { path: '/sessions/:id/progress', redirect: '/classes' }, // reflections are on My Classes now
    { path: '/chat/:id', component: ChatPage, props: true }, // the private chat of one booking
    { path: '/discussion/:id', component: DiscussionPage, props: true }, // the public discussion of one course
    { path: '/insights', component: InsightsPage },
    // homework, feedback and mastery (?tab=teaching opens the instructor's side)
    { path: '/progress', component: ProgressPage },
    { path: '/progress/assignments/:id', component: AssignmentPage, props: true },
    { path: '/reports', component: ReportsPage },
    { path: '/reports/new', component: ReportsPage, props: { creating: true } }, // the "File new report" form
    { path: '/profile', component: ProfilePage },
    { path: '/members/:uid', component: PublicProfilePage, props: true },
    { path: '/skills/teach', component: SkillListPage, props: { kind: 'teach' } },
    { path: '/skills/learn', component: SkillListPage, props: { kind: 'learn' } },
    // props: true hands the :id in the address to the page as a prop
    { path: '/teach/new', component: TeachSkillPage },
    { path: '/teach/:id', component: TeachSkillPage, props: true },
    { path: '/learn/new', component: LearnSkillPage },
    { path: '/learn/:id', component: LearnSkillPage, props: true },
    // only admins (meta.requiresAdmin is checked by the guard below)
    { path: '/admins', component: AdminPage, meta: { requiresAdmin: true } },
    { path: '/admins/users/:uid', component: AdminUserProfilePage, meta: { requiresAdmin: true } },
    // any other address (e.g. /profile/bob): "Page not found." Public, so it shows logged in or out.
    // It must stay the LAST route, because it matches everything.
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage, meta: { public: true } },
  ],
})

// The "Page not found." page, keeping the address that was typed (so the admin pages look like
// they do not exist to someone who is not an admin, instead of hinting that they are there)
function notFound(to) {
  return {
    name: 'not-found',
    params: { pathMatch: to.path.substring(1).split('/') },
    query: to.query,
    hash: to.hash,
  }
}

// Navigation guard: every page except the landing and login pages needs someone logged in, and the admin
// pages are only opened for admins. Everyone else gets "Page not found." there.
// This only decides which PAGE is shown. The real lock is on the server (verifyToken.js and
// verifyAdmin.js): even if someone got past this, every route there would still say no.
router.beforeEach(async (to) => {
  if (to.meta.public) return true

  await auth.authStateReady() // wait until Firebase has restored the login
  if (!auth.currentUser) return '/'

  if (!to.meta.requiresAdmin) return true

  try {
    const result = await checkAdmin()
    return result.isAdmin ? true : notFound(to)
  } catch (err) {
    // not a "no": we could not ask (e.g. the network is down), so say so instead of failing silently
    useToastStore().show('Could not check admin access: ' + errorText(err))
    return '/home'
  }
})

export default router