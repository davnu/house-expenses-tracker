import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CasaTabLogo } from '@/components/brand/CasaTabLogo'
import { MailCheck, ArrowLeft } from 'lucide-react'
import { friendlyError } from '@/lib/utils'
import { track } from '@/lib/analytics'
import { useAnalytics } from '@/hooks/useAnalytics'

const COOLDOWN_SECONDS = 30

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useAnalytics()

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await sendPasswordReset(email)
      setSentTo(email)
      setCooldown(COOLDOWN_SECONDS)
      track('password_reset_request')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleResetView = () => {
    setSentTo(null)
    setError('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
            {sentTo ? (
              <MailCheck className="h-7 w-7 text-primary-foreground" />
            ) : (
              <CasaTabLogo size={28} className="text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-xl">
            {sentTo ? t('auth.resetEmailSent') : t('auth.forgotPasswordTitle')}
          </CardTitle>
          <CardDescription>
            {sentTo
              ? t('auth.resetEmailSentDesc', { email: sentTo })
              : t('auth.forgotPasswordDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sentTo ? (
            <>
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    {t('auth.checkSpamTitle')}
                  </p>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/70">
                    {t('auth.checkSpamDesc')}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleResetView}
              >
                {t('auth.sendAnother')}
              </Button>

              <Link
                to="/login"
                className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('auth.backToLogin')}
              </Link>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || cooldown > 0}
                >
                  {loading
                    ? t('common.loading')
                    : cooldown > 0
                      ? t('auth.resendEmailCooldown', { seconds: cooldown })
                      : t('auth.sendResetEmail')}
                </Button>
              </form>

              <Link
                to="/login"
                className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('auth.backToLogin')}
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
