import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, CheckCircle2, Plus, Check, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { useEntitlement } from '@/hooks/use-entitlement'
import { useUpgradeDialog } from '@/context/UpgradeDialogContext'
import { useHousehold } from '@/context/HouseholdContext'
import { PRICES, reconcileOrder, type ReconcileStatus } from '@/lib/billing'

/**
 * Billing section for the Settings page. Shows tier status, purchase history,
 * and the primary upgrade path.
 *
 * Free-tier UX: shows an asymmetric "Free includes" + "Pro adds" comparison
 * so users can evaluate what they'd get without having to hit a paywall first.
 */
export function BillingSection() {
  const { t, i18n } = useTranslation()
  const { house } = useHousehold()
  const { entitlement, isPro, isLoading } = useEntitlement()
  const { open } = useUpgradeDialog()

  if (!house || isLoading) return null

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })

  const freeFeatures = [
    'billing.section.freeFeature1',
    'billing.section.freeFeature2',
    'billing.section.freeFeature3',
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

        <div className="flex flex-wrap gap-2">
          {!isPro && (
            <Button onClick={() => open('generic')}>
              {t('billing.unlockCta', { price: PRICES.pro.display })}
            </Button>
          )}
          {isPro && (
            <Button
              variant="outline"
              onClick={() => open('generic', { product: 'additional_house' })}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t('billing.buyAdditionalHouse', { price: PRICES.additional_house.display })}
            </Button>
          )}
        </div>

        {!isPro && house.id && <ReconcileLink houseId={house.id} />}
      </CardContent>
    </Card>
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
