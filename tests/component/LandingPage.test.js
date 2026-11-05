// Test 2 (component): which page a visitor gets, logged out or logged in.
// Firebase and the server are replaced by fakes, so the test can say whether someone is
// "logged in" without a real account, and the Home page loads without a real server.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

// the fake Firebase login: each test sets currentUser (null = logged out)
const fakeAuth = vi.hoisted(() => ({ currentUser: null, authStateReady: () => Promise.resolve() }))
vi.mock('@/firebase', () => ({ auth: fakeAuth }))

// the fake server: what the Home page asks for when it opens
vi.mock('@/services/api', () => ({
  getMe: async () => ({ name: 'Sam Tan', credits: 2, skillsTeach: [], skillsLearn: [], warnings: [] }),
  getMyOffers: async () => [],
  getMyGoals: async () => [],
  getMyBookings: async () => [],
  errorText: (err) => String(err),
}))

import LandingPage from '@/view/LandingPage.vue'
import HomePage from '@/view/HomePage.vue'

// The two pages, plus the rule the real router uses: pages that are not public (like /home)
// need someone to be logged in, otherwise the visitor is sent back to the landing page.
function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: LandingPage, meta: { public: true } },
      { path: '/login', component: { template: '<div>Login page</div>' }, meta: { public: true } },
      { path: '/home', component: HomePage },
      // the Home page links to other pages (Courses, My Classes...): a blank stand-in for them
      { path: '/:other(.*)*', component: { template: '<div />' }, meta: { public: true } },
    ],
  })
  router.beforeEach(async (to) => {
    if (to.meta.public) return true
    await fakeAuth.authStateReady()
    return fakeAuth.currentUser ? true : '/'
  })
  return router
}

// open the app at `path` and wait until the page has finished loading
async function openApp(path) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const wrapper = mount(RouterView, {
    global: {
      plugins: [router],
      // the nav bar and the class notices are tested elsewhere
      stubs: { NavBar: true, CancelNotices: true },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

// the first link whose text includes `text`
function link(wrapper, text) {
  return wrapper.findAll('a').find((a) => a.text().includes(text))
}

describe('Landing page and Home page', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    fakeAuth.currentUser = null
  })

  it('2a: not logged in, the website opens on the landing page with Log in and Sign up', async () => {
    const { wrapper } = await openApp('/')

    expect(wrapper.find('h1').text()).toContain('Share what you know.')
    expect(link(wrapper, 'Log in').attributes('href')).toBe('/login')
    expect(link(wrapper, 'Sign up').attributes('href')).toBe('/login?mode=signup')
    expect(link(wrapper, 'Go to my home')).toBeUndefined()
  })

  it('2b: logged in, the landing page is Home page (with tutorial)', async () => {
    fakeAuth.currentUser = { uid: 'test-user' }
    const { wrapper, router } = await openApp('/home')

    expect(router.currentRoute.value.path).toBe('/home')
    expect(wrapper.text()).toContain('Getting started with Kongsi') // the tutorial
    expect(wrapper.text()).toContain('Sam') // the personal welcome
  })

  it('2c: normal user logged in, close and reopen the website, the default landing page is used with "Go to my home" instead of sign up/login', async () => {
    fakeAuth.currentUser = { uid: 'test-user' }
    const { wrapper, router } = await openApp('/')

    expect(wrapper.find('h1').text()).toContain('Share what you know.')
    expect(link(wrapper, 'Log in')).toBeUndefined()
    
    const goHome = link(wrapper, 'Go to my home')
    expect(goHome.attributes('href')).toBe('/home')
    await goHome.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
    expect(wrapper.text()).toContain('Getting started with Kongsi')
  })
})
