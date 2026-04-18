import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Link as LinkIcon, RefreshCw, Share2, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useHousehold } from '@/context/HouseholdContext'

interface InviteHousemateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** House name used as the title in the Web Share payload. */
  houseName?: string
}

/**
 * Invite-link generator for the household.
 *
 * Generation is lazy: the link is only created when the user explicitly
 * clicks "Generate". This avoids creating throwaway Firestore docs every
 * time a curious user opens and closes the dialog. The freshly-generated
 * link is the primary affordance; "Share" (Web Share API on supported
 * browsers) and "Copy" are the actions on it.
 *
 * A request-id pattern protects against stale state when the user closes
 * and reopens (or when the parent unmounts) mid-request: results from a
 * superseded request are discarded.
 */
export function InviteHousemateDialog({ open, onOpenChange, houseName }: InviteHousemateDialogProps) {
  const { t } = useTranslation()
  const { generateInvite, house } = useHousehold()

  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const requestIdRef = useRef(0)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset transient state whenever the dialog is dismissed so reopening
  // is a clean slate. Bumping the request id invalidates any in-flight
  // generation so its result can't overwrite the fresh state.
  useEffect(() => {
    if (open) return
    requestIdRef.current += 1
    setLink('')
    setLoading(false)
    setError('')
    setCopied(false)
    if (copyTimer.current) {
      clearTimeout(copyTimer.current)
      copyTimer.current = null
    }
  }, [open])

  // Cancel any pending feedback timers on unmount AND invalidate in-flight
  // requests so a stale resolve can't setState on an unmounted component.
  useEffect(() => () => {
    requestIdRef.current += 1
    if (copyTimer.current) clearTimeout(copyTimer.current)
  }, [])

  async function handleGenerate() {
    const myId = ++requestIdRef.current
    setLoading(true)
    setError('')
    try {
      const url = await generateInvite()
      if (myId !== requestIdRef.current) return // superseded — discard
      setLink(url)
    } catch {
      if (myId !== requestIdRef.current) return
      setError(t('settings.failedToGenerateInvite'))
    } finally {
      if (myId === requestIdRef.current) setLoading(false)
    }
  }

  async function handleCopy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — leave the link visible so the user can copy manually
    }
  }

  async function handleShare() {
    if (!link) return
    try {
      await navigator.share({
        title: houseName ?? house?.name ?? t('common.houseExpenses'),
        text: t('invite.shareText', { house: houseName ?? house?.name ?? '' }),
        url: link,
      })
    } catch {
      // User cancelled or share failed — no-op (link stays visible to copy)
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle>{t('invite.title')}</DialogTitle>
          </div>
          <DialogDescription>{t('invite.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!link && !error && (
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-pulse" aria-hidden="true" />
                  {t('invite.preparing')}
                </>
              ) : (
                <>
                  <LinkIcon className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t('invite.generateLink')}
                </>
              )}
            </Button>
          )}

          {error && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                {t('common.retry')}
              </Button>
            </div>
          )}

          {link && !loading && (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={link}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  className="text-xs flex-1"
                  aria-label={t('invite.linkLabel')}
                />
                <div className="flex gap-2 shrink-0">
                  {canShare && (
                    <Button type="button" size="sm" onClick={handleShare} className="flex-1 sm:flex-none">
                      <Share2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      {t('common.share')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={canShare ? 'outline' : 'default'}
                    size="sm"
                    onClick={handleCopy}
                    className="flex-1 sm:flex-none"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        {t('settings.copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        {t('settings.copyLink')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{t('invite.expiryAndUse')}</span>
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
