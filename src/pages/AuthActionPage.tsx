import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CasaTabLogo } from '@/components/brand/CasaTabLogo'
import { CheckCircle2, TriangleAlert, Loader2, Eye, EyeOff } from 'lucide-react'
import { friendlyError } from '@/lib/utils'
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter'
import { track } from '@/lib/analytics'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { AUTH_ACTION_TITLE, RESET_PASSWORD_TITLE } from '@/lib/page-titles'

const MIN_LENGTH = 8

type Phase = 'verifying' | 'ready' | 'invalid' | 'success'

/**
 * Canonical Firebase "action URL" page. Reads `?mode` to dispatch:
 *   - resetPassword: finish a password reset started from /forgot-password
 *   - (future) verifyEmail, recoverEmail: add handlers here as needed
 *
 * Point Firebase Console → Authentication → Templates → Password reset
 * "Customize action URL" to https://<yourdomain>/auth/action so reset
 * emails land here instead of Firebase's hosted page.
 */
export function AuthActionPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')
  useDocumentTitle(mode === 'resetPassword' ? RESET_PASSWORD_TITLE : AUTH_ACTION_TITLE)

  if (mode === 'resetPassword') return <ResetPasswordHandler />

  // Unknown or missing mode — fail gracefully.
  return (
    <Shell icon="warn" title={t('auth.linkProblemTitle')} description={t('errors.invalidResetCode')}>
      <Link to="/forgot-password" className="block">
        <Button className="w-full">{t('auth.forgotPasswordTitle')}</Button>
      </Link>
      <BackLink />
    </Shell>
  )
}

function ResetPasswordHandler() {
  const { t } = useTranslation()
  const { verifyPasswordReset, confirmPasswordReset, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const oobCode = searchParams.get('oobCode') ?? ''

  const [phase, setPhase] = useState<Phase>('verifying')
  const [showSpinner, setShowSpinner] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittedRef = useRef(false)
  const verifiedRef = useRef(false)
  useAnalytics()

  // Defer the spinner by 250ms — avoids the "flash of loading" for fast verifies.
  useEffect(() => {
    if (phase !== 'verifying') return
    const timer = setTimeout(() => setShowSpinner(true), 250)
    return () => clearTimeout(timer)
  }, [phase])

  // Verify the oobCode exactly once on mount.
  useEffect(() => {
    if (verifiedRef.current) return
    verifiedRef.current = true

    if (!oobCode) {
      setPhase('invalid')
      setError(t('errors.invalidResetCode'))
      return
    }

    verifyPasswordReset(oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail)
        setPhase('ready')
      })
      .catch((err) => {
        setPhase('invalid')
        setError(friendlyError(err))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oobCode])

  const passwordsMatch = password.length > 0 && password === confirm
  const longEnough = password.length >= MIN_LENGTH
  const canSubmit = !submitting && longEnough && passwordsMatch

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || submittedRef.current) return
    submittedRef.current = true
    setError('')
    setSubmitting(true)
    try {
      await confirmPasswordReset(oobCode, password)
      // Invalidate any stale session — if the user was signed in, the token
      // would still be valid for up to an hour. Force a fresh sign-in.
      try {
        await logout()
      } catch {
        // best-effort
      }
      setPhase('success')
      track('password_reset_complete')
    } catch (err) {
      submittedRef.current = false
      setError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === 'verifying') {
    return (
      <Shell icon="logo" title={t('auth.verifyingLink')}>
        <div className="flex items-center justify-center py-4">
          {showSpinner && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        </div>
      </Shell>
    )
  }

  if (phase === 'invalid') {
    return (
      <Shell icon="warn" title={t('auth.linkProblemTitle')}>
        <p className="text-sm text-destructive text-center">{error}</p>
        <Link to="/forgot-password" className="block">
          <Button className="w-full">{t('auth.forgotPasswordTitle')}</Button>
        </Link>
        <BackLink />
      </Shell>
    )
  }

  if (phase === 'success') {
    return (
      <Shell
        icon="success"
        title={t('auth.passwordResetSuccess')}
        description={t('auth.passwordResetSuccessDesc')}
      >
        <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
          {t('auth.continueToLogin')}
        </Button>
      </Shell>
    )
  }

  // phase === 'ready'
  return (
    <Shell
      icon="logo"
      title={t('auth.resetPasswordTitle')}
      description={t('auth.resetPasswordDesc', { email })}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="new-password">{t('auth.newPassword')}</Label>
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            </button>
          </div>
          <Input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            placeholder={t('auth.newPasswordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">{t('auth.confirmPassword')}</Label>
          <Input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            placeholder={t('auth.confirmPasswordPlaceholder')}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
          />
          {confirm.length > 0 && password !== confirm && (
            <p className="text-xs text-destructive">{t('errors.passwordsDontMatch')}</p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {submitting ? t('common.loading') : t('auth.resetPasswordBtn')}
        </Button>
      </form>
      <BackLink />
    </Shell>
  )
}

function Shell({
  icon,
  title,
  description,
  children,
}: {
  icon: 'logo' | 'success' | 'warn'
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
            {icon === 'success' && <CheckCircle2 className="h-7 w-7 text-primary-foreground" />}
            {icon === 'warn' && <TriangleAlert className="h-7 w-7 text-primary-foreground" />}
            {icon === 'logo' && <CasaTabLogo size={28} className="text-primary-foreground" />}
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  )
}

function BackLink() {
  const { t } = useTranslation()
  return (
    <p className="text-center">
      <Link
        to="/login"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
      >
        {t('auth.backToLogin')}
      </Link>
    </p>
  )
}
