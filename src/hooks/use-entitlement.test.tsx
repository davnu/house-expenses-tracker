import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEntitlement } from './use-entitlement'
import { FREE_LIMITS, PRO_LIMITS } from '@/lib/entitlement-limits'
import { EntitlementProvider, useEntitlementContext } from '@/context/EntitlementContext'

// The hook is a thin reader over EntitlementContext. The real subscription
// logic lives in EntitlementProvider and is tested in EntitlementContext.test.tsx.
// Here we cover the reader behaviour only — outside-provider safety and
// the happy path when the provider supplies Pro.

// Mock the context module so we can control what the provider returns per-test.
vi.mock('@/context/EntitlementContext', () => ({
  useEntitlementContext: vi.fn(),
  EntitlementProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const mockCtx = vi.mocked(useEntitlementContext)

describe('useEntitlement (thin reader over EntitlementContext)', () => {
  it('returns loading + free-limits defaults when rendered outside the provider', () => {
    mockCtx.mockReturnValueOnce(null)
    const { result } = renderHook(() => useEntitlement())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isPro).toBe(false)
    expect(result.current.limits).toEqual(FREE_LIMITS)
    expect(result.current.entitlement).toBe(null)
  })

  it('returns what the provider supplies when inside it', () => {
    mockCtx.mockReturnValueOnce({
      entitlement: { tier: 'pro' },
      limits: PRO_LIMITS,
      isPro: true,
      isLoading: false,
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EntitlementProvider>{children}</EntitlementProvider>
    )
    const { result } = renderHook(() => useEntitlement(), { wrapper })
    expect(result.current.isPro).toBe(true)
    expect(result.current.limits).toEqual(PRO_LIMITS)
    expect(result.current.isLoading).toBe(false)
  })

  it('does not throw when the context module returns null (the safety-net guarantee)', () => {
    mockCtx.mockReturnValueOnce(null)
    expect(() => renderHook(() => useEntitlement())).not.toThrow()
  })

  it('passes the isLoading=true state through when the provider is still subscribing', () => {
    mockCtx.mockReturnValueOnce({
      entitlement: null,
      limits: FREE_LIMITS,
      isPro: false,
      isLoading: true,
    })
    const { result } = renderHook(() => useEntitlement())
    expect(result.current.isLoading).toBe(true)
  })
})
