import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render } from '@testing-library/react'
import { UpgradeDialogProvider, useUpgradeDialog } from './UpgradeDialogContext'

// Silence the expected React boundary error in the "throws outside provider" test
const originalError = console.error
beforeEach(() => {
  console.error = vi.fn()
})
afterEach(() => {
  console.error = originalError
})

describe('useUpgradeDialog', () => {
  it('throws a clear error when used outside a provider', () => {
    expect(() => renderHook(() => useUpgradeDialog())).toThrow(
      /must be used within UpgradeDialogProvider/
    )
  })

  it('starts closed with no gate and defaults the product to "pro"', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UpgradeDialogProvider>{children}</UpgradeDialogProvider>
    )
    const { result } = renderHook(() => useUpgradeDialog(), { wrapper })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.gate).toBe(null)
    expect(result.current.product).toBe('pro')
  })

  it('open() with {product: "additional_house"} routes to the correct Polar product', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UpgradeDialogProvider>{children}</UpgradeDialogProvider>
    )
    const { result } = renderHook(() => useUpgradeDialog(), { wrapper })
    act(() => result.current.open('generic', { product: 'additional_house' }))
    expect(result.current.isOpen).toBe(true)
    expect(result.current.product).toBe('additional_house')
  })

  it('open() without options resets product back to "pro" (fresh state per open)', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UpgradeDialogProvider>{children}</UpgradeDialogProvider>
    )
    const { result } = renderHook(() => useUpgradeDialog(), { wrapper })
    act(() => result.current.open('generic', { product: 'additional_house' }))
    expect(result.current.product).toBe('additional_house')
    act(() => result.current.open('invite'))
    // Default product reverts — prevents a stale "additional_house" from an earlier
    // open leaking into a later invite-gate flow.
    expect(result.current.product).toBe('pro')
  })

  it('open() without a gate defaults to "generic"', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UpgradeDialogProvider>{children}</UpgradeDialogProvider>
    )
    const { result } = renderHook(() => useUpgradeDialog(), { wrapper })
    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)
    expect(result.current.gate).toBe('generic')
  })

  it('open(gate) sets isOpen=true and remembers the gate', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UpgradeDialogProvider>{children}</UpgradeDialogProvider>
    )
    const { result } = renderHook(() => useUpgradeDialog(), { wrapper })
    act(() => result.current.open('invite'))
    expect(result.current.isOpen).toBe(true)
    expect(result.current.gate).toBe('invite')
  })

  it('close() sets isOpen=false', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UpgradeDialogProvider>{children}</UpgradeDialogProvider>
    )
    const { result } = renderHook(() => useUpgradeDialog(), { wrapper })
    act(() => result.current.open('budget'))
    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
  })

  it('re-opening with a new gate swaps the gate (so copy updates)', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UpgradeDialogProvider>{children}</UpgradeDialogProvider>
    )
    const { result } = renderHook(() => useUpgradeDialog(), { wrapper })
    act(() => result.current.open('invite'))
    expect(result.current.gate).toBe('invite')
    act(() => result.current.open('export'))
    expect(result.current.gate).toBe('export')
    expect(result.current.isOpen).toBe(true)
  })

  it('provides stable open/close identities for useEffect deps', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UpgradeDialogProvider>{children}</UpgradeDialogProvider>
    )
    const { result, rerender } = renderHook(() => useUpgradeDialog(), { wrapper })
    const firstOpen = result.current.open
    const firstClose = result.current.close
    rerender()
    expect(result.current.open).toBe(firstOpen)
    expect(result.current.close).toBe(firstClose)
  })

  it('renders children (smoke — provider is transparent when closed)', () => {
    const { getByText } = render(
      <UpgradeDialogProvider>
        <div>child content</div>
      </UpgradeDialogProvider>
    )
    expect(getByText('child content')).toBeTruthy()
  })
})
