import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AlertCircle, Sparkles, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUpgradeDialog } from '@/context/UpgradeDialogContext'

interface QuotaErrorProps {
  /** Pro users get a plain "delete to free space" notice; free users get the upgrade CTA. */
  isPro: boolean
  /**
   * `inline` — compact banner after a rejected drop (user still has the dropzone above).
   * `standing` — replaces the dropzone when the user is already at/over cap before dropping.
   */
  variant: 'inline' | 'standing'
}

/**
 * Storage-quota error surface. Unlike a bare error string, this component
 * turns the dead-end into a conversion moment for free users: a primary CTA
 * that opens the same UpgradeDialog used by every other paywall gate
 * ('storage'). Pro users (who can still hit their 500 MB cap) get a plain
 * "delete some files" notice — no fake upgrade CTA.
 *
 * Sizes (50 MB / 500 MB) are baked into the translated copy rather than
 * interpolated, so each language can use its own unit convention ("MB" in
 * en/es/de/nl/pt, "Mo" in fr) without a MB↔Mo mismatch in the rendered
 * string. If a new tier is added, re-translate.
 */
export function QuotaError({ isPro, variant }: QuotaErrorProps) {
  const { t } = useTranslation()
  const { open: openUpgrade } = useUpgradeDialog()

  // Deep-link to Documents so "delete files to free space" isn't a dead-end.
  // The user can browse their uploads from there. Rendered for both tiers —
  // Pro users have no upgrade path, so this is their ONLY next action; free
  // users get it as a secondary to the upgrade CTA ("I'll delete first").
  const manageFilesLink = (
    <Link
      to="/app/documents"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      <FolderOpen className="h-3.5 w-3.5" />
      {t('files.quotaManageLink')}
    </Link>
  )

  if (isPro) {
    if (variant === 'standing') {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-center space-y-2.5">
          <AlertCircle className="h-5 w-5 mx-auto text-destructive" />
          <p className="text-sm font-medium">{t('files.quotaReachedPro')}</p>
          <div className="flex justify-center">{manageFilesLink}</div>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <span className="flex-1 min-w-0 text-destructive">{t('files.quotaReachedPro')}</span>
        {manageFilesLink}
      </div>
    )
  }

  // Free tier — show the upgrade CTA.
  if (variant === 'standing') {
    return (
      <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-5 text-center space-y-2.5">
        <div className="mx-auto h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t('files.quotaReachedFree.title')}</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {t('files.quotaReachedFree.body')}
          </p>
        </div>
        <Button size="sm" onClick={() => openUpgrade('storage')}>
          {t('files.quotaReachedFree.cta')}
        </Button>
        <div className="flex justify-center pt-0.5">{manageFilesLink}</div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="flex-1 min-w-0">
        {t('files.quotaReachedFree.inline')}
      </span>
      <button
        type="button"
        onClick={() => openUpgrade('storage')}
        className="shrink-0 text-primary font-medium hover:underline cursor-pointer"
      >
        {t('files.quotaReachedFree.cta')}
      </button>
    </div>
  )
}
