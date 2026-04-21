import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEntitlement } from '@/hooks/use-entitlement'
import { useUpgradeDialog } from '@/context/UpgradeDialogContext'
import { useHousehold } from '@/context/HouseholdContext'
import { PRICES } from '@/lib/billing'
import { dismissBanner, isBannerDismissed } from '@/lib/banner-dismissal'

/**
 * Soft upgrade banner shown on the Dashboard for free-tier houses.
 * Dismissible per house — the dismissal is stored in a single JSON-serialised
 * localStorage map (not one key per house — see `lib/banner-dismissal.ts`)
 * and auto-expires after 90 days so long-dormant houses get another prompt.
 */
export function UpgradeBanner() {
  const { t } = useTranslation()
  const { house } = useHousehold()
  const { isPro, isLoading } = useEntitlement()
  const { open } = useUpgradeDialog()

  const [dismissed, setDismissed] = useState(() => isBannerDismissed(house?.id))

  if (isLoading || isPro || !house || dismissed) return null

  const handleDismiss = () => {
    dismissBanner(house.id)
    setDismissed(true)
  }

  return (
    <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4 pr-10">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t('billing.banner.title')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('billing.banner.subtitle', { price: PRICES.pro.display })}
          </p>
          <Button
            size="sm"
            className="mt-2.5"
            onClick={() => open('generic')}
          >
            {t('billing.banner.cta', { price: PRICES.pro.display })}
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('common.close')}
        className="absolute top-2 right-2 h-6 w-6 rounded-md flex items-center justify-center hover:bg-background/60 text-muted-foreground cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
