import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Mail } from 'lucide-react'
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
        refreshUser()
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
          <CardDescription>
            {t('auth.verifyEmailDesc', { email: user?.email })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-center text-muted-foreground">
            {t('auth.checkSpam')}
          </p>

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

          <Button variant="outline" className="w-full" onClick={logout}>
            {t('common.signOut')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
