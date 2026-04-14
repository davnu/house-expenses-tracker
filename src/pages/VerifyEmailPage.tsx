import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Mail, TriangleAlert, Loader2 } from 'lucide-react'
import { friendlyError } from '@/lib/utils'

export function VerifyEmailPage() {
  const { t } = useTranslation()
  const { user, logout, resendVerificationEmail, refreshUser } = useAuth()
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const didAutoSend = useRef(false)

  // Poll for verification every 3 seconds, pause when tab is hidden
  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible') {
        refreshUser().catch(() => {})
      }
    }
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [refreshUser])

  // Auto-send verification email once on mount (for returning unverified users)
  useEffect(() => {
    if (didAutoSend.current) return
    didAutoSend.current = true

    resendVerificationEmail()
      .then(() => {
        setResendCooldown(60)
        setSent(true)
      })
      .catch(() => {
        // Silently fail — user can manually resend
      })
  }, [resendVerificationEmail])

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  const handleResend = async () => {
    setError('')
    setResending(true)
    setSent(false)
    try {
      await resendVerificationEmail()
      setResendCooldown(60)
      setSent(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">{t('auth.verifyEmailTitle')}</CardTitle>
          <CardDescription className="mt-1">
            {t('auth.verifyEmailDesc')}
          </CardDescription>
          <p className="mt-2 text-sm font-medium text-foreground">{user?.email}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Spam warning callout */}
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {t('auth.checkSpamTitle')}
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/70">
                {t('auth.checkSpamDesc')}
              </p>
            </div>
          </div>

          {/* Waiting indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{t('auth.waitingForVerification')}</span>
          </div>

          {error && <p className="text-sm text-center text-destructive">{error}</p>}
          {sent && !error && (
            <p className="text-sm text-center text-emerald-600">{t('auth.emailSent')}</p>
          )}

          <Button
            className="w-full"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
          >
            {resendCooldown > 0
              ? t('auth.resendEmailCooldown', { seconds: resendCooldown })
              : t('auth.resendEmail')}
          </Button>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <button
              type="button"
              onClick={logout}
              className="hover:text-foreground hover:underline transition-colors cursor-pointer"
            >
              {t('auth.wrongEmail')}
            </button>
            <button
              type="button"
              onClick={logout}
              className="hover:text-foreground hover:underline transition-colors cursor-pointer"
            >
              {t('common.signOut')}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
