import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStorageQuota } from './use-storage-quota'
import type { TierLimits } from '@/lib/entitlement-limits'

const FREE_LIMITS: TierLimits = {
  maxMembers: 1, maxStorageMB: 50, hasHouseholdInvites: false, hasAdvancedMortgage: false,
  hasBudget: false, hasExport: false, hasPrintSummary: false, hasMortgageWhatIf: false,
}
const PRO_LIMITS: TierLimits = {
  maxMembers: Number.POSITIVE_INFINITY, maxStorageMB: 500, hasHouseholdInvites: true, hasAdvancedMortgage: true,
  hasBudget: true, hasExport: true, hasPrintSummary: true, hasMortgageWhatIf: true,
}

// Mutable mocks: the hook composes useDocuments + useEntitlement, so we
// swap these between tests without spinning up the real providers.
// Inlined limits shape because vi.hoisted runs before module-level consts.
const mockDocsCtx = vi.hoisted(() => ({ value: { totalStorageUsed: 0 } }))
const mockEntitlementCtx = vi.hoisted(() => ({
  value: {
    entitlement: null as unknown,
    limits: {
      maxMembers: 1, maxStorageMB: 50, hasHouseholdInvites: false, hasAdvancedMortgage: false,
      hasBudget: false, hasExport: false, hasPrintSummary: false, hasMortgageWhatIf: false,
    } as TierLimits,
    isPro: false,
    isLoading: false,
  },
}))

vi.mock('@/context/DocumentContext', () => ({
  useDocuments: () => mockDocsCtx.value,
}))
vi.mock('@/hooks/use-entitlement', () => ({
  useEntitlement: () => mockEntitlementCtx.value,
}))

describe('useStorageQuota', () => {
  it('returns free-tier 50 MB cap when entitlement is free', () => {
    mockEntitlementCtx.value = { entitlement: null, limits: FREE_LIMITS, isPro: false, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 10 * 1024 * 1024 }
    const { result } = renderHook(() => useStorageQuota())
    expect(result.current.maxBytes).toBe(50 * 1024 * 1024)
    expect(result.current.limitMB).toBe(50)
    expect(result.current.bytesUsed).toBe(10 * 1024 * 1024)
    expect(result.current.bytesRemaining).toBe(40 * 1024 * 1024)
    expect(result.current.isPro).toBe(false)
  })

  it('returns Pro 500 MB cap when house is on Pro — regression: the context-layer bug silently used 50 MB', () => {
    mockEntitlementCtx.value = { entitlement: { tier: 'pro' }, limits: PRO_LIMITS, isPro: true, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 43 * 1024 * 1024 } // ~the exact state the user reported
    const { result } = renderHook(() => useStorageQuota())
    expect(result.current.maxBytes).toBe(500 * 1024 * 1024)
    expect(result.current.limitMB).toBe(500)
    expect(result.current.bytesRemaining).toBe((500 - 43) * 1024 * 1024)
    expect(result.current.isPro).toBe(true)
  })

  it('clamps bytesRemaining to 0 when usage exceeds the cap (drift safety)', () => {
    // Server-side quota drift or concurrent-upload race can push usage past cap.
    // UI should treat that as "0 remaining", never a negative number.
    mockEntitlementCtx.value = { entitlement: null, limits: FREE_LIMITS, isPro: false, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 60 * 1024 * 1024 }
    const { result } = renderHook(() => useStorageQuota())
    expect(result.current.bytesRemaining).toBe(0)
  })

  it('validate() passes the tier cap into the underlying validator', () => {
    mockEntitlementCtx.value = { entitlement: { tier: 'pro' }, limits: PRO_LIMITS, isPro: true, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 60 * 1024 * 1024 } // over free cap, under Pro
    const { result } = renderHook(() => useStorageQuota())
    // This file would be rejected under the free-tier 50 MB cap, but should
    // pass under Pro's 500 MB cap. Guards against regressions where the hook
    // forgets to forward the tier-resolved limit.
    const file = new File(['x'], 'ok.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 })
    const { accepted, rejection } = result.current.validate([file])
    expect(rejection).toBeNull()
    expect(accepted).toHaveLength(1)
  })

  it('propagates isLoading so callers can gate uploads during cold start', () => {
    mockEntitlementCtx.value = { entitlement: null, limits: FREE_LIMITS, isPro: false, isLoading: true }
    mockDocsCtx.value = { totalStorageUsed: 0 }
    const { result } = renderHook(() => useStorageQuota())
    expect(result.current.isLoading).toBe(true)
  })

  it('validate() forwards stagedFiles + existingCount through to the underlying validator', () => {
    mockEntitlementCtx.value = { entitlement: null, limits: FREE_LIMITS, isPro: false, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 0 }
    const { result } = renderHook(() => useStorageQuota())
    const staged = [new File(['s'], 'staged.pdf', { type: 'application/pdf' })]
    Object.defineProperty(staged[0], 'size', { value: 49 * 1024 * 1024 })
    const incoming = new File(['i'], 'new.pdf', { type: 'application/pdf' })
    Object.defineProperty(incoming, 'size', { value: 2 * 1024 * 1024 })
    // stagedFiles (49 MB) + incoming (2 MB) = 51 MB > 50 MB cap → rejection
    const { rejection } = result.current.validate([incoming], { stagedFiles: staged })
    expect(rejection?.code).toBe('householdStorageLimit')
  })

  it('validate() keeps a stable identity between renders when inputs are unchanged (useEffect-dep safety)', () => {
    // Callers will put validate in useEffect/useCallback deps. If the hook
    // returns a new function reference on every render, those effects run
    // on every parent re-render — causing upload restart bugs.
    mockEntitlementCtx.value = { entitlement: null, limits: FREE_LIMITS, isPro: false, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 1000 }
    const { result, rerender } = renderHook(() => useStorageQuota())
    const first = result.current.validate
    rerender()
    expect(result.current.validate).toBe(first)
  })

  it('validate() gets a NEW identity when bytesUsed changes (so stale quota calcs can be invalidated)', () => {
    // The flip side of the stability test: when storage actually changes,
    // downstream memoizations should recompute. Otherwise a validate() closure
    // captured by a memoized parent would check against stale usage.
    mockEntitlementCtx.value = { entitlement: null, limits: FREE_LIMITS, isPro: false, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 1000 }
    const { result, rerender } = renderHook(() => useStorageQuota())
    const first = result.current.validate
    mockDocsCtx.value = { totalStorageUsed: 2000 }
    rerender()
    expect(result.current.validate).not.toBe(first)
  })

  it('cross-feature Pro: combined 450 MB used, a 20 MB file still validates (fits in Pro headroom)', () => {
    // The shape of the bug reported from production: a user with a mix of
    // document uploads and expense attachments can't be silo'd to one or the
    // other when checking the quota. This test seeds a combined 450 MB via
    // the document mock (which in DocumentContext sums expenses + documents)
    // and asserts a 20 MB file (under the 25 MB per-file cap) is accepted
    // because Pro has 50 MB of household headroom after it.
    mockEntitlementCtx.value = { entitlement: { tier: 'pro' }, limits: PRO_LIMITS, isPro: true, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 450 * 1024 * 1024 }
    const { result } = renderHook(() => useStorageQuota())
    const file = new File(['x'], 'receipt.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 })
    const { accepted, rejection } = result.current.validate([file])
    expect(accepted).toHaveLength(1)
    expect(rejection).toBeNull()
  })

  it('cross-feature Pro: combined 495 MB used, a 6 MB file overflows and is rejected (503 MB > 500)', () => {
    // Matching negative: same setup but the file would tip the household over
    // the Pro cap. Covers the upper boundary of the cross-feature check.
    mockEntitlementCtx.value = { entitlement: { tier: 'pro' }, limits: PRO_LIMITS, isPro: true, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 495 * 1024 * 1024 }
    const { result } = renderHook(() => useStorageQuota())
    const file = new File(['x'], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 })
    const { rejection } = result.current.validate([file])
    expect(rejection?.code).toBe('householdStorageLimit')
  })

  it('validateExpenseAttachment applies MAX_FILES_PER_EXPENSE without the caller passing it', () => {
    // Expense-flow convenience wrapper: the cap used to live at two call sites
    // (FileDropZone + ExpenseList.handleFileSelected), each re-passing the
    // literal. The wrapper takes it off the call sites so forgetting it can't
    // re-introduce the drift-from-intended-limit class of bug.
    mockEntitlementCtx.value = { entitlement: null, limits: FREE_LIMITS, isPro: false, isLoading: false }
    mockDocsCtx.value = { totalStorageUsed: 0 }
    const { result } = renderHook(() => useStorageQuota())
    // 11 files — one over the 10-per-expense cap. Plain `validate()` has no
    // cap by default, so this test proves the wrapper adds it.
    const files = Array.from({ length: 11 }, (_, i) => {
      const f = new File(['x'], `f${i}.pdf`, { type: 'application/pdf' })
      Object.defineProperty(f, 'size', { value: 100 })
      return f
    })
    const { accepted, rejection } = result.current.validateExpenseAttachment(files)
    expect(accepted).toHaveLength(10)
    expect(rejection?.code).toBe('maxFilesPerExpense')
  })
})
