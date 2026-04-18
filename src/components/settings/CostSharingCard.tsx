import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Scale, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn, formatCurrency, friendlyError } from '@/lib/utils'
import { useHousehold } from '@/context/HouseholdContext'
import { useExpenses } from '@/context/ExpenseContext'
import { useHouseAllocation } from '@/hooks/use-house-allocation'
import { TOTAL_BPS, isEqualSplit, makeEqualSplit } from '@/lib/cost-split'
import type { CostSplitShare } from '@/types/expense'

type Mode = 'equal' | 'custom'

/**
 * Household-level cost sharing ratio. The ratio the couple agreed on is the
 * anchor for every expense allocation — so setting it once means the rest of
 * the app can stay out of the user's way.
 */
export function CostSharingCard() {
  const { t } = useTranslation()
  const { members, house, houseSplit, updateCostSplit } = useHousehold()
  const { expenses } = useExpenses()

  const storedIsEqual = !house?.costSplit || isEqualSplit(houseSplit)
  const [mode, setMode] = useState<Mode>(storedIsEqual ? 'equal' : 'custom')

  // Editable per-member percentages (integers, 0-100)
  const [percents, setPercents] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      houseSplit.map((s) => [s.uid, String(Math.round(s.shareBps / 100))]),
    ),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedPulse, setSavedPulse] = useState(false)

  // Resync local edit state when the stored split changes from elsewhere
  useEffect(() => {
    setPercents(
      Object.fromEntries(
        houseSplit.map((s) => [s.uid, String(Math.round(s.shareBps / 100))]),
      ),
    )
    setMode(storedIsEqual ? 'equal' : 'custom')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house?.id])

  const parsedSum = useMemo(() => {
    return members.reduce((sum, m) => {
      const v = parseInt(percents[m.uid] ?? '0', 10)
      return sum + (Number.isFinite(v) ? v : 0)
    }, 0)
  }, [percents, members])

  const remaining = 100 - parsedSum
  const isValid = parsedSum === 100 && members.every((m) => {
    const v = parseInt(percents[m.uid] ?? '0', 10)
    return Number.isFinite(v) && v >= 0 && v <= 100
  })

  // Draft ratio the user is composing (used both for preview and for save).
  // Returned as CostSplitShare[] summing to 10000; falls back to null when invalid.
  const draftSplit = useMemo<CostSplitShare[] | null>(() => {
    if (mode === 'equal') {
      return members.length >= 2 ? makeEqualSplit(members.map((m) => m.uid)) : null
    }
    if (!isValid) return null
    let allocated = 0
    return members.map((m, i) => {
      const pct = parseInt(percents[m.uid] ?? '0', 10)
      if (i === members.length - 1) {
        return { uid: m.uid, shareBps: TOTAL_BPS - allocated }
      }
      const bps = pct * 100
      allocated += bps
      return { uid: m.uid, shareBps: bps }
    })
  }, [mode, members, percents, isValid])

  // Current allocation per member (memoized, from existing expenses + stored split).
  const current = useHouseAllocation(expenses)
  // Speculative allocation if the draft is saved — lets the user see the effect
  // of the change before committing.
  const preview = useHouseAllocation(expenses, draftSplit ?? undefined)

  // Is the draft meaningfully different from what's saved?
  const draftDiffers = useMemo(() => {
    if (!draftSplit) return false
    if (mode === 'equal' && storedIsEqual) return false
    if (mode === 'custom' && !storedIsEqual) {
      const storedMap = new Map(houseSplit.map((s) => [s.uid, s.shareBps]))
      return draftSplit.some((d) => storedMap.get(d.uid) !== d.shareBps)
    }
    return true
  }, [draftSplit, mode, storedIsEqual, houseSplit])

  const showPreview = draftDiffers && draftSplit && current.total > 0

  // Hide entirely for single-member households — no split to set
  if (members.length < 2) return null

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      if (mode === 'equal') {
        await updateCostSplit(null)
      } else {
        // Convert integer percents to bps. Last member absorbs the remainder so
        // the total lands exactly on 10000 even with rounding.
        let allocated = 0
        const split = members.map((m, i) => {
          const pct = parseInt(percents[m.uid] ?? '0', 10)
          if (i === members.length - 1) {
            return { uid: m.uid, shareBps: TOTAL_BPS - allocated }
          }
          const bps = pct * 100
          allocated += bps
          return { uid: m.uid, shareBps: bps }
        })
        await updateCostSplit(split)
      }
      setSavedPulse(true)
      setTimeout(() => setSavedPulse(false), 1500)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  const canSave = !saving && (mode === 'equal' ? !storedIsEqual : isValid)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          <CardTitle>{t('costSharing.title')}</CardTitle>
        </div>
        <CardDescription>{t('costSharing.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode: Equally */}
        <label
          className={cn(
            'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
            mode === 'equal' ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
          )}
        >
          <input
            type="radio"
            name="cost-sharing-mode"
            className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
            checked={mode === 'equal'}
            onChange={() => setMode('equal')}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{t('costSharing.equalLabel')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t('costSharing.equalHint', { count: members.length })}
            </div>
          </div>
        </label>

        {/* Mode: Custom */}
        <label
          className={cn(
            'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
            mode === 'custom' ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
          )}
        >
          <input
            type="radio"
            name="cost-sharing-mode"
            className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
            checked={mode === 'custom'}
            onChange={() => setMode('custom')}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{t('costSharing.customLabel')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t('costSharing.customHint')}
            </div>
          </div>
        </label>

        {/* Custom ratio editor — only shown when custom mode is active */}
        {mode === 'custom' && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            {members.map((m) => (
              <div key={m.uid} className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: m.color }}
                  aria-hidden="true"
                />
                <Label
                  htmlFor={`pct-${m.uid}`}
                  className="flex-1 min-w-0 truncate font-medium text-sm"
                >
                  {m.displayName}
                </Label>
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    id={`pct-${m.uid}`}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    className="h-9 w-20 text-right"
                    value={percents[m.uid] ?? ''}
                    onChange={(e) =>
                      setPercents((prev) => ({ ...prev, [m.uid]: e.target.value }))
                    }
                  />
                  <span className="text-sm text-muted-foreground w-4">%</span>
                </div>
              </div>
            ))}
            <div
              className={cn(
                'flex items-center justify-between text-xs pt-1 border-t',
                parsedSum === 100 ? 'text-muted-foreground' : 'text-destructive',
              )}
              aria-live="polite"
            >
              <span>{t('costSharing.total')}</span>
              <span className="font-medium">
                {parsedSum}%
                {remaining !== 0 && ` (${remaining > 0 ? '+' : ''}${remaining}% ${t('costSharing.toAdjust')})`}
              </span>
            </div>
          </div>
        )}

        {/* Live preview — shows how the draft would shift each person's share
            of the already-logged expenses. Hidden when there's nothing to
            preview (no expenses yet, or the draft matches the stored value). */}
        {showPreview && (
          <div className="rounded-lg border border-dashed bg-background p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('costSharing.previewTitle', { total: formatCurrency(current.total) })}
            </p>
            <div className="space-y-1.5">
              {members.map((m) => {
                const from = current.allocation.get(m.uid) ?? 0
                const to = preview.allocation.get(m.uid) ?? 0
                const changed = from !== to
                return (
                  <div key={m.uid} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: m.color }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 min-w-0 truncate">{m.displayName}</span>
                    <span className="tabular-nums text-muted-foreground">{formatCurrency(from)}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className={cn('tabular-nums font-medium', changed && 'text-primary')}>
                      {formatCurrency(to)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
          {savedPulse && (
            <span className="flex items-center gap-1 text-xs text-primary font-medium">
              <Check className="h-3.5 w-3.5" />
              {t('costSharing.saved')}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
