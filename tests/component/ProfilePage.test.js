
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import ProfilePage from '../../src/view/ProfilePage.vue'

const { mockPush, mockAuth } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockAuth: {
    currentUser: { uid: 'test-user' },
    authStateReady: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('../../src/firebase', () => ({
  auth: mockAuth,
}))

const store = reactive({
  profile: null,
  credits: 0,
  loading: false,
  saving: false,
  error: '',
  saveError: '',
  skillCards: [],
  myOffers: [],
  myGoals: [],
  fetchProfile: vi.fn().mockResolvedValue(undefined),
  fetchOptions: vi.fn().mockResolvedValue(undefined),
  fetchSkillCards: vi.fn().mockResolvedValue(undefined),
  fetchMyCourses: vi.fn().mockResolvedValue(undefined),
  saveProfile: vi.fn().mockResolvedValue(true),
})

vi.mock('../../src/stores/profile', () => ({
  useProfileStore: () => store,
}))

vi.mock('../../src/stores/toast', () => ({
  useToastStore: () => ({ show: vi.fn() }),
}))

const stubs = {
  NavBar: true,
  LoadingText: true,
  EditProfileModal: {
    template: '<div class="edit-profile-modal">Edit profile form</div>',
  },
  SkillCard: {
    props: ['skill'],
    template: '<article class="test-skill-card">{{ skill.name }}</article>',
  },
}

async function renderPage() {
  const wrapper = mount(ProfilePage, {
    global: { stubs },
  })
  await flushPromises()
  return wrapper
}

describe('ProfilePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.currentUser = { uid: 'test-user' }

    store.profile = {
      name: 'Alex Tan',
      email: 'alex@example.com',
      bio: 'I enjoy sharing skills.',
      region: 'Central',
      credits: 50,
      skillsTeach: [{ name: 'Tennis', category: 'Sports' }],
      skillsLearn: [{ name: 'Photography', category: 'Arts' }],
    }

    store.credits = 50
    store.loading = false
    store.saving = false
    store.error = ''
    store.saveError = ''
    store.skillCards = []
    store.myOffers = []
    store.myGoals = []
  })

  it('loads profile data when the page opens', async () => {
    await renderPage()

    expect(mockAuth.authStateReady).toHaveBeenCalled()
    expect(store.fetchProfile).toHaveBeenCalled()
    expect(store.fetchOptions).toHaveBeenCalled()
    expect(store.fetchSkillCards).toHaveBeenCalled()
    expect(store.fetchMyCourses).toHaveBeenCalled()
  })

  it('displays the member name, bio, region and email', async () => {
    const wrapper = await renderPage()

    expect(wrapper.find('h1').text()).toBe('Alex Tan')
    expect(wrapper.text()).toContain('I enjoy sharing skills.')
    expect(wrapper.text()).toContain('Central region')
    expect(wrapper.text()).toContain('alex@example.com')
  })

  it('displays the correct time credits', async () => {
    const wrapper = await renderPage()

    expect(wrapper.find('.credits-card .display-5').text()).toBe('50')
  })

  it('displays teaching and learning skills', async () => {
    const wrapper = await renderPage()

    expect(wrapper.text()).toContain('Skills I Can Teach')
    expect(wrapper.text()).toContain('Tennis')
    expect(wrapper.text()).toContain('Skills I Want to Learn')
    expect(wrapper.text()).toContain('Photography')
  })

  it('opens the edit profile modal', async () => {
    const wrapper = await renderPage()

    const editButton = wrapper.findAll('button')
      .find(button => button.text() === 'Edit profile')

    expect(editButton).toBeDefined()
    await editButton.trigger('click')
    await nextTick()

    expect(wrapper.find('.edit-profile-modal').exists()).toBe(true)
  })

  it('shows an empty state when no skill cards exist', async () => {
    const wrapper = await renderPage()

    expect(wrapper.text()).toContain('No skill cards yet.')
  })

  it('renders earned skill cards when available', async () => {
    store.skillCards = [
      { id: 'card-1', name: 'Badminton', category: 'Sports' },
    ]

    const wrapper = await renderPage()

    expect(wrapper.findAll('.test-skill-card')).toHaveLength(1)
    expect(wrapper.find('.test-skill-card').text()).toBe('Badminton')
  })

  it('redirects unauthenticated users to login', async () => {
    mockAuth.currentUser = null

    await renderPage()

    expect(mockPush).toHaveBeenCalledWith('/login')
    expect(store.fetchProfile).not.toHaveBeenCalled()
  })
})
