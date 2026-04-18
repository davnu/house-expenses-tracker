import { useTranslation } from 'react-i18next'
import { scorePassword } from '@/lib/password-strength'
import { cn } from '@/lib/utils'

const BAR_COLORS = [
  'bg-destructive',
  'bg-destructive',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-emerald-500',
] as const

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { t } = useTranslation()
  if (!password) return null

  const { score, labelKey } = scorePassword(password)
  const labelMap = {
    veryWeak: t('auth.strengthVeryWeak'),
    weak: t('auth.strengthWeak'),
    fair: t('auth.strengthFair'),
    strong: t('auth.strengthStrong'),
    veryStrong: t('auth.strengthVeryStrong'),
  }

  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < score ? BAR_COLORS[score] : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('auth.passwordStrength', { label: labelMap[labelKey] })}
      </p>
    </div>
  )
}
