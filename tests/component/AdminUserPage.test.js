import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import UserProfile from '@/view/AdminUserProfilePage.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: {
      uid: 'user123'
    }
  }),
  useRouter: () => ({
    push: vi.fn()
  })
}))

vi.mock('@/stores/toast', () => ({
  useToastStore: () => ({
    show: vi.fn()
  })
}))

vi.mock('@/services/api', () => ({
  getAdminUser: vi.fn().mockResolvedValue({
    id: 'user123',
    name: 'John Doe',
    email: 'john@test.com',
    credits: 25,
    reports: [],
    warnings: [],
    skillsTeach: ['Math'],
    skillsLearn: ['Programming'],
    isBanned: false,
    messageReportsFiled: 0,
    messageReportsDismissed: 0,
    createdAt: '2026-01-01'
  }),

  banUser: vi.fn(),
  unbanUser: vi.fn(),
  warnUser: vi.fn(),
  removeWarning: vi.fn(),
  errorText: vi.fn(() => '')
}))

describe('User Profile Page', () => {
  it('renders user details correctly', async () => {
    const wrapper = mount(UserProfile, {
      global: {
        stubs: {
          LoadingText: true
        }
      }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('John Doe')
    expect(wrapper.text()).toContain('john@test.com')
    expect(wrapper.text()).toContain('25')
    expect(wrapper.text()).toContain('Active')
    expect(wrapper.text()).toContain('Math')
    expect(wrapper.text()).toContain('Programming')
  })
})