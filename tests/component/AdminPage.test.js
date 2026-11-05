// AdminPage.component.spec.js

import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import AdminPage from '@/view/AdminPage.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

vi.mock('@/services/api', () => ({
  getAdminUsers: vi.fn().mockResolvedValue([]),
  getDisputes: vi.fn().mockResolvedValue({
    open: [],
    settled: []
  }),
  getMessageReports: vi.fn().mockResolvedValue({
    open: [],
    handled: []
  }),
  getAllReports: vi.fn().mockResolvedValue([]),
  settleDispute: vi.fn(),
  getDisputeMessages: vi.fn(),
  updateReportAsAdmin: vi.fn(),
  errorText: vi.fn(() => '')
}))

// Mock toast store
vi.mock('@/stores/toast', () => ({
  useToastStore: () => ({
    show: vi.fn()
  })
}))

describe('AdminPage', () => {
  it('switches from Users tab to Disputes tab', async () => {
    const wrapper = mount(AdminPage, {
      global: {
        stubs: {
          LoadingText: true,
          AdminMessageReports: true
        }
      }
    })

    await flushPromises()

    // Users tab is initially active
    expect(wrapper.text()).toContain('Email')
    expect(wrapper.text()).toContain('Credits')

    // Click Disputes tab
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')

    expect(wrapper.text()).toContain('Member reports')
    expect(wrapper.text()).toContain('Booking problems')
  })
})