import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useBudget } from '@/context/BudgetContext'
import { useExpenses } from '@/context/ExpenseContext'
import { CATEGORY_VALUES, CATEGORY_COLORS, getCategoryLabel } from '@/lib/constants'
import { formatCurrency, parseCurrencyInput, friendlyError } from '@/lib/utils'
import type { ExpenseCategory } from '@/types/expense'
import type { BudgetConfig } from '@/types/budget'

interface BudgetSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BudgetSetupDialog({ open, onOpenChange }: BudgetSetupDialogProps) {
  const { t } = useTranslation()
  const { budget, saveBudget, deleteBudget } = useBudget()
  const { expenses } = useExpenses()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showOther, setShowOther] = useState(false)

  const [totalBudgetInput, setTotalBudgetInput] = useState('')
  const [categoryInputs, setCategoryInputs] = useState<Record<string, string>>({})

  // Categories that matter: have expenses OR have an existing limit
  const { primaryCategories, otherCategories } = useMemo(() => {
    const usedCats = new Set(expenses.map((e) => e.category))
    const budgetedCats = new Set(
      Object.entries(budget?.categories ?? {})
        .filter(([, amount]) => amount && amount > 0)
        .map(([cat]) => cat)
    )

    // First time (no budget yet): show all categories — user needs to see the full list
    if (!budget) {
      return { primaryCategories: [...CATEGORY_VALUES], otherCategories: [] }
    }

    // Editing: show categories with expenses or existing limits at top, collapse the rest
    const primary: typeof CATEGORY_VALUES[number][] = []
    const other: typeof CATEGORY_VALUES[number][] = []

    for (const cat of CATEGORY_VALUES) {
      if (usedCats.has(cat) || budgetedCats.has(cat)) {
        primary.push(cat)
      } else {
        other.push(cat)
      }
    }

    return { primaryCategories: primary, otherCategories: other }
  }, [expenses, budget])

  // Populate form once when dialog opens — not when budget changes mid-edit
  const prevOpen = useRef(false)
  useEffect(() => {
    if (open && !prevOpen.current) {
      setError('')
      setShowOther(false)
      if (budget) {
        setTotalBudgetInput(budget.totalBudget > 0 ? (budget.totalBudget / 100).toString() : '')
        const inputs: Record<string, string> = {}
        for (const [cat, amount] of Object.entries(budget.categories)) {
          if (amount && amount > 0) inputs[cat] = (amount / 100).toString()
        }
        setCategoryInputs(inputs)
      } else {
        setTotalBudgetInput('')
        setCategoryInputs({})
      }
    }
    prevOpen.current = open
  }, [open, budget])

  const categorySum = useMemo(() => {
    return Object.values(categoryInputs).reduce((sum, val) => {
      const cents = parseCurrencyInput(val)
      return sum + cents
    }, 0)
  }, [categoryInputs])

  const handleCategoryChange = (cat: string, value: string) => {
    setCategoryInputs((prev) => ({ ...prev, [cat]: value }))
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      const totalBudget = parseCurrencyInput(totalBudgetInput)
      const categories: Partial<Record<ExpenseCategory, number>> = {}
      for (const cat of CATEGORY_VALUES) {
        const val = categoryInputs[cat]
        if (val) {
          const cents = parseCurrencyInput(val)
          if (cents > 0) categories[cat] = cents
        }
      }

      // Nothing to save — treat as a no-op instead of creating a useless Firestore doc
      if (totalBudget <= 0 && Object.keys(categories).length === 0) {
        onOpenChange(false)
        return
      }

      const config: BudgetConfig = {
        totalBudget,
        categories,
        updatedAt: '',
      }
      await saveBudget(config)
      onOpenChange(false)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setError('')
    setSaving(true)
    try {
      await deleteBudget()
      onOpenChange(false)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  const renderCategoryRow = (cat: string) => (
    <div key={cat} className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: CATEGORY_COLORS[cat] ?? '#6b7280' }}
      />
      <span className="text-sm flex-1 truncate min-w-0">{getCategoryLabel(cat)}</span>
      <Input
        type="number"
        step="0.01"
        min="0"
        placeholder="0.00"
        className="w-28 text-right"
        value={categoryInputs[cat] ?? ''}
        onChange={(e) => handleCategoryChange(cat, e.target.value)}
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { setError(''); onOpenChange(v) } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('budget.budgetSetup')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Total budget */}
          <div className="space-y-1.5">
            <Label htmlFor="total-budget">{t('budget.totalBudget')}</Label>
            <p className="text-xs text-muted-foreground">{t('budget.totalBudgetHint')}</p>
            <Input
              id="total-budget"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={totalBudgetInput}
              onChange={(e) => setTotalBudgetInput(e.target.value)}
            />
          </div>

          {/* Per-category limits */}
          <div className="space-y-2">
            <div>
              <Label>{t('budget.perCategory')}</Label>
              <p className="text-xs text-muted-foreground">{t('budget.perCategoryHint')}</p>
            </div>

            {/* Primary categories: ones the user has expenses or limits for */}
            {primaryCategories.length > 0 && (
              <div className="space-y-1.5">
                {primaryCategories.map(renderCategoryRow)}
              </div>
            )}

            {/* Other categories: collapsible */}
            {otherCategories.length > 0 && (
              <>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => setShowOther(!showOther)}
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showOther ? 'rotate-180' : ''}`} />
                  {t('budget.otherCategories')} ({otherCategories.length})
                </button>
                {showOther && (
                  <div className="space-y-1.5">
                    {otherCategories.map(renderCategoryRow)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Category sum */}
          {categorySum > 0 && (
            <div className="text-sm text-muted-foreground">
              {t('budget.categoryTotal', { amount: formatCurrency(categorySum) })}
              {parseCurrencyInput(totalBudgetInput) > 0 && categorySum < parseCurrencyInput(totalBudgetInput) && (
                <span className="ml-2">
                  ({t('budget.unallocated', { amount: formatCurrency(parseCurrencyInput(totalBudgetInput) - categorySum) })})
                </span>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div>
              {budget && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleRemove}
                  disabled={saving}
                >
                  {t('budget.removeBudget')}
                </Button>
              )}
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t('common.saving') : t('budget.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
