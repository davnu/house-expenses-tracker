import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Sparkles, Users, Landmark, Download, Target, HardDrive, HomeIcon, Plus, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useHousehold } from '@/context/HouseholdContext'
import { useUpgradeDialog } from '@/context/UpgradeDialogContext'
import { CheckoutNotConfigured, PRICES, startCheckout, type CheckoutProduct } from '@/lib/billing'
import type { PaywallGate } from '@/lib/entitlement-limits'

/**
 * Each gate carries:
 *   - titleKey / subtitleKey: what the modal opens with
 *   - ctaKey: the primary button label — value-led ("Invite your partner")
 *     not transactional ("Unlock for €49"). Price becomes microcopy.
 *
 * The 'generic' gate falls back to the price-led CTA since there's no
 * specific action to highlight.
 */
const GATE_COPY: Record<
  PaywallGate,
  { titleKey: string; subtitleKey: string; ctaKey?: string; icon: typeof Users }
> = {
  invite: { titleKey: 'billing.gate.invite.title', subtitleKey: 'billing.gate.invite.subtitle', ctaKey: 'billing.gate.invite.cta', icon: Users },
  advanced_mortgage: { titleKey: 'billing.gate.advancedMortgage.title', subtitleKey: 'billing.gate.advancedMortgage.subtitle', ctaKey: 'billing.gate.advancedMortgage.cta', icon: Landmark },
  budget: { titleKey: 'billing.gate.budget.title', subtitleKey: 'billing.gate.budget.subtitle', ctaKey: 'billing.gate.budget.cta', icon: Target },
  export: { titleKey: 'billing.gate.export.title', subtitleKey: 'billing.gate.export.subtitle', ctaKey: 'billing.gate.export.cta', icon: Download },
  print: { titleKey: 'billing.gate.print.title', subtitleKey: 'billing.gate.print.subtitle', ctaKey: 'billing.gate.print.cta', icon: Download },
  what_if: { titleKey: 'billing.gate.whatIf.title', subtitleKey: 'billing.gate.whatIf.subtitle', ctaKey: 'billing.gate.whatIf.cta', icon: Landmark },
  storage: { titleKey: 'billing.gate.storage.title', subtitleKey: 'billing.gate.storage.subtitle', ctaKey: 'billing.gate.storage.cta', icon: HardDrive },
  create_house: { titleKey: 'billing.gate.createHouse.title', subtitleKey: 'billing.gate.createHouse.subtitle', ctaKey: 'billing.gate.createHouse.cta', icon: Plus },
  generic: { titleKey: 'billing.gate.generic.title', subtitleKey: 'billing.gate.generic.subtitle', icon: Sparkles },
}

const PRODUCT_COPY: Record<
  CheckoutProduct,
  { price: string; titleKeyOverride?: string; subtitleKeyOverride?: string; icon?: typeof Users }
> = {
  pro: { price: PRICES.pro.display },
  additional_house: {
    price: PRICES.additional_house.display,
    titleKeyOverride: 'billing.product.additionalHouse.title',
    subtitleKeyOverride: 'billing.product.additionalHouse.subtitle',
    icon: HomeIcon,
  },
}

export function UpgradeModal() {
  const { t } = useTranslation()
  const { house } = useHousehold()
  const { isOpen, gate, product, close } = useUpgradeDialog()
  const [loading, setLoading] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [error, setError] = useState('')
  const [newHouseName, setNewHouseName] = useState('')
  const primaryCtaRef = useRef<HTMLButtonElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const gateCopy = GATE_COPY[gate ?? 'generic']
  const productCopy = PRODUCT_COPY[product]
  // Product-specific copy wins over gate copy when present (e.g. "Add another house")
  const titleKey = productCopy.titleKeyOverride ?? gateCopy.titleKey
  const subtitleKey = productCopy.subtitleKeyOverride ?? gateCopy.subtitleKey
  const Icon = productCopy.icon ?? gateCopy.icon
  const price = productCopy.price

  const needsNewHouseName = product === 'additional_house'
  const trimmedName = newHouseName.trim()
  const canCheckout = !needsNewHouseName || trimmedName.length > 0

  // Reset the name + transient errors every time the dialog re-opens, so
  // re-entering the paywall from a different gate doesn't leak prior state.
  useEffect(() => {
    if (!isOpen) {
      setNewHouseName('')
      setError('')
      setNotConfigured(false)
    }
  }, [isOpen])

  const handleCheckout = async () => {
    if (!house?.id) return
    if (needsNewHouseName && !trimmedName) {
      // Shouldn't happen (button is disabled) but guards against form submit
      // via Enter when the input is empty.
      nameInputRef.current?.focus()
      return
    }
    setLoading(true)
    setError('')
    setNotConfigured(false)
    try {
      await startCheckout(
        house.id,
        product,
        gate ?? 'generic',
        needsNewHouseName ? { newHouseName: trimmedName } : undefined,
      )
    } catch (e) {
      if (e instanceof CheckoutNotConfigured) {
        setNotConfigured(true)
      } else {
        setError((e as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }

  // Pro feature benefits — shown for the primary 'pro' product.
  const proFeatures: { icon: typeof Users; key: string }[] = [
    { icon: Users, key: 'billing.features.invites' },
    { icon: Landmark, key: 'billing.features.advancedMortgage' },
    { icon: Target, key: 'billing.features.budget' },
    { icon: Download, key: 'billing.features.export' },
    { icon: HardDrive, key: 'billing.features.storage' },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && close()}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          // Radix Dialog focuses the first focusable element by default (here
          // the close button). When we need a new-house name, focus the input
          // instead so the user can start typing immediately. Otherwise focus
          // the primary CTA so keyboard + screen-reader users land on the
          // verb. Restoration on close is still handled by Radix (the
          // triggering element regains focus automatically).
          event.preventDefault()
          if (needsNewHouseName) {
            nameInputRef.current?.focus()
          } else {
            primaryCtaRef.current?.focus()
          }
        }}
      >
        <DialogHeader>
          <div className="flex items-start gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="break-words">{t(titleKey)}</DialogTitle>
              <DialogDescription className="mt-0.5 break-words">
                {t(subtitleKey)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-xl border bg-card p-4 mb-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl font-bold tracking-tight">{price}</span>
            <span className="ml-auto text-xs text-muted-foreground shrink-0">{t('billing.oneTime')}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {product === 'pro'
              ? t('billing.lifetimeForHouse')
              : t('billing.product.additionalHouse.note')}
          </p>
          {product === 'pro' && (
            <p className="text-[11px] text-muted-foreground/80 mt-2 italic">
              {t('billing.priceContext')}
            </p>
          )}
        </div>

        {product === 'pro' && (
          <ul className="space-y-2 mb-4">
            {proFeatures.map(({ icon: FeatureIcon, key }) => (
              <li key={key} className="flex items-start gap-2.5 text-sm">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="h-3 w-3 text-primary" />
                </div>
                <span className="text-foreground">
                  <FeatureIcon className="h-3.5 w-3.5 text-muted-foreground inline mr-1 -mt-0.5" />
                  {t(key)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {needsNewHouseName && (
          <div className="space-y-1.5 mb-3">
            <Label htmlFor="upgrade-new-house-name">
              {t('billing.product.additionalHouse.nameLabel')}
            </Label>
            <Input
              ref={nameInputRef}
              id="upgrade-new-house-name"
              type="text"
              maxLength={80}
              placeholder={t('billing.product.additionalHouse.namePlaceholder')}
              value={newHouseName}
              onChange={(e) => setNewHouseName(e.target.value)}
              autoFocus
              disabled={loading}
            />
            <p className="text-[11px] text-muted-foreground">
              {t('billing.product.additionalHouse.nameHelp')}
            </p>
          </div>
        )}

        {notConfigured && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 mb-3 text-xs text-amber-900 dark:text-amber-200"
          >
            {t('billing.checkoutComingSoon')}
          </div>
        )}
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 mb-3 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            ref={primaryCtaRef}
            onClick={handleCheckout}
            disabled={loading || !house?.id || !canCheckout}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                {t('billing.redirecting')}
              </>
            ) : product === 'pro' && gateCopy.ctaKey ? (
              t(gateCopy.ctaKey)
            ) : (
              t('billing.unlockCta', { price })
            )}
          </Button>
          {product === 'pro' && gateCopy.ctaKey && (
            <p className="text-[11px] text-center text-muted-foreground">
              {t('billing.ctaSubline', { price })}
            </p>
          )}
          {product === 'pro' && (
            <p className="text-[11px] text-center text-muted-foreground">
              {t('billing.additionalHouseNote', { price: PRICES.additional_house.display })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
