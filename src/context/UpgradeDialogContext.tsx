import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { PaywallGate } from '@/lib/entitlement-limits'
import type { CheckoutProduct } from '@/lib/billing'

export interface UpgradeOptions {
  /** Which Polar product to check out. Defaults to 'pro' (first-house upgrade). */
  product?: CheckoutProduct
}

interface UpgradeDialogContextValue {
  isOpen: boolean
  gate: PaywallGate | null
  product: CheckoutProduct
  open: (gate?: PaywallGate, options?: UpgradeOptions) => void
  close: () => void
}

const UpgradeDialogContext = createContext<UpgradeDialogContextValue | null>(null)

/**
 * Provides a single, app-wide upgrade modal. Any feature can call
 * `useUpgradeDialog().open('invite')` to surface Pro upgrade copy tailored
 * to the gate that triggered it.
 *
 * The `product` option lets callers route to a different Polar product —
 * e.g. "Add another house" from Settings → `open('generic', { product: 'additional_house' })`.
 * Defaults to `'pro'` so existing callers Just Work.
 */
export function UpgradeDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [gate, setGate] = useState<PaywallGate | null>(null)
  const [product, setProduct] = useState<CheckoutProduct>('pro')

  const open = useCallback((g?: PaywallGate, options?: UpgradeOptions) => {
    setGate(g ?? 'generic')
    setProduct(options?.product ?? 'pro')
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  return (
    <UpgradeDialogContext.Provider value={{ isOpen, gate, product, open, close }}>
      {children}
    </UpgradeDialogContext.Provider>
  )
}

export function useUpgradeDialog() {
  const ctx = useContext(UpgradeDialogContext)
  if (!ctx) throw new Error('useUpgradeDialog must be used within UpgradeDialogProvider')
  return ctx
}
