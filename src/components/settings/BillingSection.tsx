import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, CheckCircle2, Plus, Check, Loader2, Home, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { useAuth } from '@/context/AuthContext'
import { useEntitlement } from '@/hooks/use-entitlement'
import { useCreateHouse } from '@/context/CreateHouseContext'
import { useUpgradeDialog } from '@/context/UpgradeDialogContext'
import { useHousehold } from '@/context/HouseholdContext'
import {
  CheckoutNotConfigured,
  PRICES,
  reconcileOrder,
  startCheckout,
  type ReconcileStatus,
} from '@/lib/billing'

/**
 * Billing section for the Settings page. Now owns the single source of truth
 * for "create new house" across all four `useCreateHouse().reason` states —
 * this consolidates what used to live in three different surfaces (Household
 * card, HouseSwitcher dropdown, BillingSection button).
 *
 * Key decisions codified here:
 *   • Upgrade-for-€49 CTA is gated on OWNERSHIP of the current house, not
 *     just `!isPro`. This removes the "non-owner sees nonsensical upgrade
 *     button" case and, as a side-effect, eliminates the double-CTA collision
 *     for Pro users viewing a free house they joined as a member (they now
 *     see only the €29 add-another-house button).
 *   • The hasProHouse branch uses an INLINE EXPANDABLE form rather than
 *     opening the upgrade modal. Removes a click depth and matches the
 *     Billing-as-inventory-surface mental model.
 *   • Loading state renders a skeleton button (reserves space) so the card
 *     doesn't visibly jump on entitlement subscription resolve.
 */
export function BillingSection() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { house } = useHousehold()
  const { entitlement, isPro, isLoading } = useEntitlement()
  const { open } = useUpgradeDialog()
  const { reason: createHouseReason, ownedCount, openCreateDialog } = useCreateHouse()

  if (!house || isLoading) return null

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })

  // Only the owner can upgrade THIS house. A member-only user seeing
  // "Upgrade for €49" on a joined house is nonsensical — they have no
  // standing to upgrade someone else's house.
  const isOwnerOfCurrentHouse = user != null && house.ownerId === user.uid

  // The add-another-house CTA is primary (default style) whenever it is the
  // only action in the row. It's the only action when (a) the user is Pro
  // (no upgrade CTA rendered) or (b) the upgrade CTA is hidden by ownership.
  const addAnotherIsPrimary = isPro || !isOwnerOfCurrentHouse

  const freeFeatures = [
    'billing.section.freeFeature1',
    'billing.section.freeFeature2',
    'billing.section.freeFeature3',
    // Storage quota — sits last in both columns so the reader's eye tracks
    // 50 MB ↔ 500 MB at matching positions in Free vs Pro Unlocks. Parallel
    // structure does the upsell work without needing salesy framing.
    'billing.features.storageFree',
  ] as const

  const proFeatures = [
    'billing.features.invites',
    'billing.features.advancedMortgage',
    'billing.features.budget',
    'billing.features.export',
    'billing.features.storage',
  ] as const

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {t('billing.section.title')}
            </CardTitle>
            <CardDescription className="mt-1">
              {isPro ? t('billing.section.proSubtitle') : t('billing.section.freeSubtitle')}
            </CardDescription>
          </div>
          {isPro ? (
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Pro
            </Badge>
          ) : (
            <Badge variant="outline">{t('billing.section.freeBadge')}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/*
          Inventory framing: "Houses on your plan: N". The research on
          per-entity paywall surfaces says the Billing section should frame
          houses as inventory (what you own) while the HouseSwitcher frames
          them as action ("add another"). This one line does the framing.
          Hidden for ownedCount=0 since "0 houses" reads as a broken state.
        */}
        {ownedCount > 0 && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t('billing.section.housesOnYourPlan', { count: ownedCount })}
            </span>
          </p>
        )}

        {isPro && entitlement && (
          <dl className="text-sm space-y-1.5">
            {entitlement.purchasedAt && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('billing.section.purchasedOn')}</dt>
                <dd className="font-medium">{formatDate(entitlement.purchasedAt)}</dd>
              </div>
            )}
            {entitlement.grandfathered && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('billing.section.source')}</dt>
                <dd className="font-medium">{t('billing.section.foundingMember')}</dd>
              </div>
            )}
            {entitlement.polarOrderId && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('billing.section.orderId')}</dt>
                <dd className="font-mono text-xs">{entitlement.polarOrderId}</dd>
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-2 border-t mt-2">
              {t('billing.section.noSubscriptionNote')}
            </p>
          </dl>
        )}

        {!isPro && entitlement?.revokedAt && (
          <div
            role="status"
            className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <p className="font-medium">{t('billing.section.revokedTitle')}</p>
            <p className="mt-0.5">
              {t('billing.section.revokedOn', { date: formatDate(entitlement.revokedAt) })}
            </p>
            <p className="mt-0.5">{t('billing.section.revokedHelp')}</p>
          </div>
        )}

        {!isPro && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">
                {t('billing.section.freeIncludes')}
              </p>
              <ul className="text-sm space-y-1.5">
                {freeFeatures.map((key) => (
                  <li key={key} className="flex items-start gap-1.5">
                    <Check className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-primary mb-2 font-medium">
                {t('billing.section.proAdds')}
              </p>
              <ul className="text-sm space-y-1.5">
                {proFeatures.map((key) => (
                  <li key={key} className="flex items-start gap-1.5">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {/*
              Upgrade-for-€49 is gated on OWNERSHIP of the current house.
              Pre-fix this shipped "Upgrade for €49" to member-only users
              viewing a house they didn't own — offering an upgrade they
              literally can't complete (server permission-denied).
            */}
            {!isPro && isOwnerOfCurrentHouse && (
              <Button onClick={() => open('generic')}>
                {t('billing.unlockCta', { price: PRICES.pro.display })}
              </Button>
            )}

            {/*
              Create-house action — one of three branches, or a skeleton
              during the subscription window so the card doesn't shift.

                first        → free dialog (new owner path)
                hasProHouse  → inline "Add another house" form with €29 paid
                               checkout (subcomponent below)
                needsUpgrade → hidden: main Upgrade CTA is the path
                loading      → skeleton placeholder: reserves space, no shift
            */}
            {createHouseReason === 'first' && (
              <Button
                variant={addAnotherIsPrimary ? 'default' : 'outline'}
                onClick={openCreateDialog}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t('settings.createNewHouse')}
              </Button>
            )}
            {createHouseReason === 'loading' && (
              <CreateHouseCtaSkeleton />
            )}
          </div>

          {/*
            hasProHouse gets the inline form at the end of the buttons row
            because the form grows vertically when expanded — putting it
            last keeps the rest of the row stable during expansion.
          */}
          {createHouseReason === 'hasProHouse' && house.id && (
            <AddAnotherHouseInline
              houseId={house.id}
              isPrimary={addAnotherIsPrimary}
            />
          )}
        </div>

        {!isPro && house.id && <ReconcileLink houseId={house.id} />}
      </CardContent>
    </Card>
  )
}

/**
 * Reserves the visual footprint of the create-house button while
 * entitlement subscriptions are still loading. Prevents the 100-500ms
 * layout shift that otherwise occurs when the button materializes.
 */
function CreateHouseCtaSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-9 w-36 rounded-md bg-muted/60 animate-pulse"
    />
  )
}

/**
 * Inline expandable form for "Add another house" (product='additional_house').
 *
 * Design rationale: for users already on Pro, the additional-house purchase
 * collects exactly one field (the new house's name). The UpgradeModal adds
 * ceremony that's valuable for first-time Pro conversion but unnecessary
 * for repeat buyers. Skipping the modal here drops one click out of the
 * path to checkout and keeps the user's eyes on the Billing surface where
 * the inventory context (houses count, plan status) lives.
 *
 * The HouseSwitcher still routes through the modal — the two surfaces
 * serve different user intents (navigation vs billing) and the modal's
 * product recap is valuable when the entry point isn't itself billing.
 */
function AddAnotherHouseInline({
  houseId,
  isPrimary,
}: {
  houseId: string
  isPrimary: boolean
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notConfigured, setNotConfigured] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset transient state every time the form collapses so a failed
  // checkout doesn't leave a stale error banner on the next open.
  useEffect(() => {
    if (!expanded) {
      setError('')
      setNotConfigured(false)
    } else {
      // Autofocus the input on expand — users clicked explicitly, they want
      // to type immediately.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [expanded])

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0 && !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    setNotConfigured(false)
    try {
      await startCheckout(houseId, 'additional_house', 'create_house', {
        newHouseName: trimmed,
      })
      // On success the page navigates to Polar; we don't reach this line.
    } catch (err) {
      if (err instanceof CheckoutNotConfigured) {
        setNotConfigured(true)
      } else {
        setError((err as Error).message)
      }
      setLoading(false)
    }
  }

  if (!expanded) {
    return (
      <div>
        <Button
          variant={isPrimary ? 'default' : 'outline'}
          className={
            isPrimary ? undefined : 'border-primary/40 hover:border-primary/60'
          }
          onClick={() => setExpanded(true)}
          aria-label={t('billing.section.addAnotherHouseAriaLabel', {
            price: PRICES.additional_house.display,
          })}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          <span>{t('billing.section.addAnotherHouseCta')}</span>
          <span className="ml-2 font-semibold text-xs" aria-hidden="true">
            {PRICES.additional_house.display}
          </span>
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2"
      aria-label={t('billing.section.addAnotherHouseCta')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1.5">
          <Label
            htmlFor="billing-new-house-name"
            className="text-sm font-medium"
          >
            {t('billing.product.additionalHouse.nameLabel')}
          </Label>
          <Input
            ref={inputRef}
            id="billing-new-house-name"
            type="text"
            maxLength={80}
            placeholder={t('billing.product.additionalHouse.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
          <p className="text-[11px] text-muted-foreground">
            {t('billing.product.additionalHouse.nameHelp')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded(false)
            setName('')
          }}
          className="text-muted-foreground hover:text-foreground p-1 -mr-1 rounded-md"
          aria-label={t('common.cancel')}
          disabled={loading}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {notConfigured && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200"
        >
          {t('billing.checkoutComingSoon')}
        </div>
      )}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive"
        >
          {error}
        </div>
      )}

      <Button
        type="submit"
        size="sm"
        className="w-full"
        disabled={!canSubmit}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
            {t('billing.redirecting')}
          </>
        ) : (
          <>
            {t('billing.section.continueToCheckoutCta', {
              price: PRICES.additional_house.display,
            })}
          </>
        )}
      </Button>
    </form>
  )
}

/**
 * "I paid but don't see Pro" escape hatch for free-tier users. Opens a small
 * dialog that calls `reconcileOrder`, which asks the server to re-check Polar
 * for a paid order matching this house. Covers the rare case where the webhook
 * silently failed.
 */
function ReconcileLink({ houseId }: { houseId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ReconcileStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setRunning(false)
    setResult(null)
    setError(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) reset()
  }

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await reconcileOrder(houseId)
      setResult(res.status)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground hover:underline self-start"
      >
        {t('billing.reconcile.link')}
      </button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('billing.reconcile.title')}</DialogTitle>
          <DialogDescription>{t('billing.reconcile.subtitle')}</DialogDescription>
        </DialogHeader>

        {result === null && !error && (
          <div className="text-sm text-muted-foreground">
            {t('billing.reconcile.body')}
          </div>
        )}

        {result === 'reconciled' && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
          >
            {t('billing.reconcile.successReconciled')}
          </div>
        )}

        {result === 'already-pro' && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
          >
            {t('billing.reconcile.successAlreadyPro')}
          </div>
        )}

        {result === 'no-order' && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
          >
            {t('billing.reconcile.noOrder')}
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" type="button">
              {result === 'reconciled' || result === 'already-pro'
                ? t('common.done')
                : t('common.cancel')}
            </Button>
          </DialogClose>
          {result !== 'reconciled' && result !== 'already-pro' && (
            <Button onClick={run} disabled={running} aria-busy={running}>
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  {t('billing.reconcile.checking')}
                </>
              ) : (
                t('billing.reconcile.runCta')
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
