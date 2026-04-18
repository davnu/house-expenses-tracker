/**
 * Lightweight password strength scoring — no external dep.
 * Scores 0–4 based on length and character-class variety.
 * Not a replacement for zxcvbn; good enough to nudge users past trivially weak passwords.
 */

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  labelKey: 'veryWeak' | 'weak' | 'fair' | 'strong' | 'veryStrong'
}

export function scorePassword(password: string): PasswordStrength {
  if (!password) return { score: 0, labelKey: 'veryWeak' }

  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  if (classes >= 2) score++
  if (classes >= 3) score++

  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4
  const labels = ['veryWeak', 'weak', 'fair', 'strong', 'veryStrong'] as const
  return { score: clamped, labelKey: labels[clamped] }
}
