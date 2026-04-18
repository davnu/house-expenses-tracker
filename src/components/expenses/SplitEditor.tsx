import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Scale, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn, formatCurrency } from '@/lib/utils'
import { applyRatioToAmount, makeEqualSplit } from '@/lib/cost-split'
import type { ExpenseSplit, CostSplitShare, HouseMember } from '@/types/expense'

type Mode = 'equal' | 'exact'

interface SplitEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Total amount of the expense in cents. */
  amountCents: number
  members: HouseMember[]
  /** Household ratio — used as the initial seed if there's no existing value. */
  houseSplit: CostSplitShare[]
  /** Currently configured per-person cash contributions, if any. */
  value: ExpenseSplit[] | null
  /** Called with the chosen per-person cash amounts. */
  onSave: (splits: ExpenseSplit[]) => void
}

/**
 * Modal editor for configuring per-person cash contributions of a split payment.
 * Two mental models: "equally among some of us" and "exactly these amounts".
 * Each tab serves one model cleanly so the user never has to translate
 * between them.
 */
export function SplitEditor({
  open,
  onOpenChange,
  amountCents,
  members,
  houseSplit,
  value,
  onSave,
}: SplitEditorProps) {
  const { t } = useTranslation()

  // Infer the initial mode from the incoming value. When no override exists,
  // default to "equal" among all members because it's the most common edit path.
  const [mode, setMode] = useState<Mode>('equal')

  // For Equal mode: which members are included in the equal split
  const [included, setIncluded] = useState<Set<string>>(new Set())

  // For Exact mode: per-member amount string (cents as whole-unit display)
  const [amounts, setAmounts] = useState<Record<string, string>>({})

  // Reset state whenever the editor opens or its inputs change
  useEffect(() => {
    if (!open) return

    // Compute current per-member allocation (override or household default)
    const effective = value && value.length > 0
      ? value
      : applyRatioToAmount(amountCents, houseSplit)

    const includedSet = new Set(effective.filter((s) => s.shareCents > 0).map((s) => s.uid))
    // If nothing positive (e.g. zero amount), default to all members
    const startIncluded = includedSet.size > 0
      ? includedSet
      : new Set(members.map((m) => m.uid))

    setIncluded(startIncluded)
    setAmounts(
      Object.fromEntries(
        members.map((m) => {
          const found = effective.find((s) => s.uid === m.uid)
          const cents = found?.shareCents ?? 0
          return [m.uid, (cents / 100).toFixed(2)]
        }),
      ),
    )

    // Guess the mode: if the override is an equal split across the currently
    // included members, open in Equal mode; otherwise Exact. Shape-based
    // comparison (by uid → cents map) avoids array-order fragility.
    if (!value || value.length === 0) {
      setMode('equal')
    } else {
      const expected = new Map(
        applyRatioToAmount(amountCents, makeEqualSplit([...startIncluded])).map(
          (e) => [e.uid, e.shareCents],
        ),
      )
      const actualPositive = new Map(
        value.filter((v) => v.shareCents > 0).map((v) => [v.uid, v.shareCents]),
      )
      let matchesEqual = expected.size === actualPositive.size
      if (matchesEqual) {
        for (const [uid, cents] of expected) {
          if (actualPositive.get(uid) !== cents) {
            matchesEqual = false
            break
          }
        }
      }
      setMode(matchesEqual ? 'equal' : 'exact')
    }
  }, [open, amountCents, members, houseSplit, value])

  // Derived values for "Equal" mode
  const equalSplits = useMemo(() => {
    const includedIds = members.map((m) => m.uid).filter((uid) => included.has(uid))
    if (includedIds.length === 0) return []
    return applyRatioToAmount(amountCents, makeEqualSplit(includedIds))
  }, [amountCents, members, included])

  // Derived values for "Exact" mode
  const exactTotals = useMemo(() => {
    return members.map((m) => {
      const val = parseFloat(amounts[m.uid] ?? '0')
      const cents = Number.isFinite(val) ? Math.round(val * 100) : 0
      return { uid: m.uid, shareCents: cents < 0 ? 0 : cents }
    })
  }, [amounts, members])

  const exactSum = exactTotals.reduce((s, e) => s + e.shareCents, 0)
  const exactRemaining = amountCents - exactSum

  const equalValid = included.size > 0 && amountCents > 0
  const exactValid = exactRemaining === 0 && amountCents > 0

  const handleSave = () => {
    if (mode === 'equal') {
      if (!equalValid) return
      // Build full per-member splits: excluded members get 0 shareCents so the
      // document shape stays stable across members who left or weren't included.
      const byUid = new Map(equalSplits.map((s) => [s.uid, s.shareCents]))
      const full = members.map((m) => ({
        uid: m.uid,
        shareCents: byUid.get(m.uid) ?? 0,
      }))
      onSave(full)
    } else {
      if (!exactValid) return
      onSave(exactTotals)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('splitEditor.title')}</DialogTitle>
          <DialogDescription>
            {t('splitEditor.subtitle', { amount: formatCurrency(amountCents) })}
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 mb-4">
          <button
            type="button"
            onClick={() => setMode('equal')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
              mode === 'equal'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Users className="h-4 w-4" />
            {t('splitEditor.equalTab')}
          </button>
          <button
            type="button"
            onClick={() => setMode('exact')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
              mode === 'exact'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Scale className="h-4 w-4" />
            {t('splitEditor.exactTab')}
          </button>
        </div>

        {mode === 'equal' ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('splitEditor.equalHint')}</p>
            {members.map((m) => {
              const isIn = included.has(m.uid)
              const share = equalSplits.find((s) => s.uid === m.uid)
              return (
                <label
                  key={m.uid}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                    isIn ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary cursor-pointer"
                    checked={isIn}
                    onChange={() =>
                      setIncluded((prev) => {
                        const next = new Set(prev)
                        if (next.has(m.uid)) next.delete(m.uid)
                        else next.add(m.uid)
                        return next
                      })
                    }
                  />
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: m.color }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 min-w-0 truncate font-medium text-sm">
                    {m.displayName}
                  </span>
                  <span
                    className={cn(
                      'text-sm tabular-nums',
                      isIn ? 'font-semibold' : 'text-muted-foreground',
                    )}
                  >
                    {isIn && share ? formatCurrency(share.shareCents) : '—'}
                  </span>
                </label>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('splitEditor.exactHint')}</p>

            {/* Quick-pick presets for the common 2-person split ratios. One tap
                applies amounts that sum exactly to the total — skips typing. */}
            {members.length === 2 && amountCents > 0 && (() => {
              const [mA, mB] = members
              const applyRatio = (aBps: number, bBps: number) => {
                const split = applyRatioToAmount(amountCents, [
                  { uid: mA.uid, shareBps: aBps },
                  { uid: mB.uid, shareBps: bBps },
                ])
                setAmounts(
                  Object.fromEntries(
                    split.map((s) => [s.uid, (s.shareCents / 100).toFixed(2)]),
                  ),
                )
              }
              const presets = [
                { label: '50 / 50', a: 5000, b: 5000 },
                { label: '60 / 40', a: 6000, b: 4000 },
                { label: '70 / 30', a: 7000, b: 3000 },
              ]
              return (
                <div className="flex flex-wrap gap-1.5 pb-1" role="group" aria-label={t('splitEditor.presetsLabel')}>
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyRatio(p.a, p.b)}
                      className="text-xs px-2.5 py-1 rounded-full border border-input hover:bg-accent transition-colors cursor-pointer tabular-nums"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )
            })()}

            {members.map((m) => (
              <div
                key={m.uid}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: m.color }}
                  aria-hidden="true"
                />
                <Label
                  htmlFor={`split-${m.uid}`}
                  className="flex-1 min-w-0 truncate font-medium text-sm"
                >
                  {m.displayName}
                </Label>
                <Input
                  id={`split-${m.uid}`}
                  type="number"
                  step="0.01"
                  min={0}
                  inputMode="decimal"
                  className="h-9 w-28 text-right tabular-nums"
                  value={amounts[m.uid] ?? ''}
                  onChange={(e) =>
                    setAmounts((prev) => ({ ...prev, [m.uid]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div
              className={cn(
                'flex items-center justify-between rounded-lg px-3 py-2 mt-2 text-sm',
                exactRemaining === 0
                  ? 'bg-primary/5 text-primary'
                  : 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
              )}
              aria-live="polite"
            >
              <span className="font-medium">
                {exactRemaining === 0
                  ? t('splitEditor.balanced')
                  : exactRemaining > 0
                  ? t('splitEditor.remaining', { amount: formatCurrency(exactRemaining) })
                  : t('splitEditor.overAllocated', { amount: formatCurrency(-exactRemaining) })}
              </span>
              <span className="tabular-nums text-xs">
                {formatCurrency(exactSum)} / {formatCurrency(amountCents)}
              </span>
            </div>
          </div>
        )}

        {/* Explain why Save is disabled rather than leaving the user to
            connect "amber warning" with "greyed button" on their own. */}
        {mode === 'exact' && !exactValid && (
          <p
            className="text-xs text-muted-foreground italic mt-3"
            aria-live="polite"
          >
            {t('splitEditor.saveHint', { amount: formatCurrency(amountCents) })}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 mt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={mode === 'equal' ? !equalValid : !exactValid}
          >
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
