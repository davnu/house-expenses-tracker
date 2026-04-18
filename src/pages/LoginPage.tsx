import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter'
import { CasaTabLogo } from '@/components/brand/CasaTabLogo'
import { friendlyError } from '@/lib/utils'
import { track } from '@/lib/analytics'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { LOGIN_TITLE, SIGNUP_TITLE } from '@/lib/page-titles'

interface LoginPageProps {
  subtitle?: string
}

export function LoginPage({ subtitle }: LoginPageProps) {
  const { t, i18n } = useTranslation()
  const { signInEmail, signUpEmail, signInGoogle } = useAuth()
  const [searchParams] = useSearchParams()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useDocumentTitle(isSignUp ? SIGNUP_TITLE : LOGIN_TITLE)
  useAnalytics()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    track(isSignUp ? 'signup_start' : 'login_start', { method: 'email' })
    try {
      if (isSignUp) {
        await signUpEmail(email, password, displayName)
        track('sign_up', { method: 'email', language: i18n.language })
      } else {
        await signInEmail(email, password)
        track('login', { method: 'email' })
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setLoading(true)
    track(isSignUp ? 'signup_start' : 'login_start', { method: 'google' })
    try {
      await signInGoogle()
      // Google popup can't distinguish first-timer vs returning without a profile read —
      // fire 'login' to avoid double-counting. Email flow above handles sign_up cleanly.
      track('login', { method: 'google' })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = !loading && (!isSignUp || consent)

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
            <CasaTabLogo size={28} className="text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">{t('common.houseExpenses')}</CardTitle>
          <CardDescription>
            {subtitle ?? t('auth.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
            disabled={loading}
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t('auth.continueWithGoogle')}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t('common.or')}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="displayName">{t('auth.yourName')}</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder={t('auth.namePlaceholder')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required={isSignUp}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('auth.password')}</Label>
                {!isSignUp && (
                  <Link
                    to="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
                  >
                    {t('auth.forgotPassword')}
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder={isSignUp ? t('auth.newPasswordPlaceholder') : t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                minLength={isSignUp ? 8 : 6}
              />
              {isSignUp && <PasswordStrengthMeter password={password} />}
            </div>

            {isSignUp && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                />
                <span className="text-sm text-muted-foreground">
                  {t('auth.agreeToPrivacy')}{' '}
                  <Link to="/privacy" target="_blank" className="text-primary hover:underline font-medium">
                    {t('common.privacyPolicy')}
                  </Link>
                </span>
              </label>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {loading ? t('common.loading') : isSignUp ? t('auth.createAccount') : t('auth.signIn')}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? t('auth.alreadyHaveAccount') : t('auth.dontHaveAccount')}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setConsent(false)
                setError('')
              }}
              className="text-primary font-medium hover:underline cursor-pointer"
            >
              {isSignUp ? t('auth.signInLink') : t('auth.signUpLink')}
            </button>
          </p>

          <p className="text-center text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:underline">{t('common.privacyPolicy')}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
