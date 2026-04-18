import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Users, ChevronRight, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { PayerSelect } from './PayerSelect'
import { FileDropZone } from './FileDropZone'
import { SplitEditor } from './SplitEditor'
import { Switch } from '@/components/ui/switch'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { EXPENSE_CATEGORIES, SHARED_PAYER, SPLIT_PAYER, SPLIT_PAYER_COLOR } from '@/lib/constants'
import { useHousehold } from '@/context/HouseholdContext'
import { useExpenses } from '@/context/ExpenseContext'
import { useAuth } from '@/context/AuthContext'
import { applyRatioToAmount, makeEqualSplit } from '@/lib/cost-split'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import type { Expense, ExpenseSplit } from '@/types/expense'

function createExpenseSchema(t: (key: string) => string) {
  return z.object({
    amount: z.string().min(1, t('common.required')).refine((v) => parseFloat(v) > 0, t('common.mustBePositive')),
    category: z.string().min(1, t('common.required')),
    payer: z.string().min(1, t('common.required')),
    description: z.string().optional(),
    date: z.string().min(1, t('common.required')),
    paid: z.boolean(),
  })
}

type ExpenseFormData = z.infer<ReturnType<typeof createExpenseSchema>>

interface ExpenseFormProps {
  onSubmit: (data: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, files: File[]) => Promise<void>
  defaultValues?: Partial<ExpenseFormData>
  defaultSplits?: ExpenseSplit[] | null
  hideAttachments?: boolean
  submitLabel?: string
}

export function ExpenseForm({
  onSubmit,
  defaultValues,
  defaultSplits,
  hideAttachments,
  submitLabel,
}: ExpenseFormProps) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<File[]>([])
  const { members, houseSplit } = useHousehold()
  const { storageUsed } = useExpenses()
  const { user } = useAuth()

  // Per-expense cash contribution breakdown. Only meaningful when payer is SPLIT_PAYER.
  const [splits, setSplits] = useState<ExpenseSplit[] | null>(defaultSplits ?? null)
  const [splitOpen, setSplitOpen] = useState(false)
  // Transient notice: splits were auto-cleared because the amount changed
  const [invalidatedNotice, setInvalidatedNotice] = useState(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks whether we've already auto-opened the editor for this form instance
  // — avoids popping the dialog repeatedly as the user flips the payer.
  const didAutoOpenRef = useRef(false)

  const isMultiMember = members.length > 1
  const defaultPayer = defaultValues?.payer ?? (isMultiMember ? SHARED_PAYER : (user?.uid ?? ''))

  const { register, handleSubmit, reset, watch, control, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(createExpenseSchema(t)),
    defaultValues: {
      amount: '',
      category: 'other',
      payer: defaultPayer,
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      paid: true,
      ...defaultValues,
    },
  })

  const watchedAmount = watch('amount')
  const watchedPayer = watch('payer')
  const amountCents = useMemo(() => {
    const n = parseFloat(watchedAmount ?? '')
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
  }, [watchedAmount])

  const isSplitPayer = watchedPayer === SPLIT_PAYER

  // Whenever the payer moves away from Split payment, drop the stored splits so
  // a single-payer/shared expense is never written with a stale splits array.
  useEffect(() => {
    if (!isSplitPayer && splits) setSplits(null)
  }, [isSplitPayer, splits])

  // Auto-open the editor the first time the user picks Split payment on this
  // expense, once we have an amount to work with. Removes the "pick payer → tap
  // chip → editor" two-tap flow. Only fires once per form lifetime; subsequent
  // flips or amount changes don't re-open.
  useEffect(() => {
    if (isSplitPayer && amountCents > 0 && !splits && !didAutoOpenRef.current) {
      didAutoOpenRef.current = true
      setSplitOpen(true)
    }
  }, [isSplitPayer, amountCents, splits])

  // Auto-invalidate splits when the amount changes and no longer matches the
  // stored sum. We clear rather than guess: "Alice paid €60 / Bob paid €40" for
  // €100 doesn't tell us what to do when the amount becomes €110 — the extra
  // €10 didn't come from anywhere the app knows about. Silent proportional
  // rescale is a trap; surfacing the invalidation is honest.
  useEffect(() => {
    if (!isSplitPayer) return
    if (!splits || splits.length === 0) return
    if (amountCents === 0) return
    const sum = splits.reduce((s, e) => s + e.shareCents, 0)
    if (sum !== amountCents) {
      setSplits(null)
      setInvalidatedNotice(true)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      noticeTimer.current = setTimeout(() => setInvalidatedNotice(false), 4000)
    }
  }, [amountCents, splits, isSplitPayer])

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [])

  // Summary string for the chip — shows equal vs custom vs per-member amounts.
  const splitSummary = useMemo(() => {
    if (!isSplitPayer || !splits || splits.length === 0) return null

    const positive = splits.filter((s) => s.shareCents > 0)
    if (positive.length === 0) return t('splitChip.equal')

    const allEqual = positive.length > 1 && positive.every(
      (p) => Math.abs(p.shareCents - positive[0].shareCents) <= 1,
    )
    if (allEqual && positive.length === members.length) return t('splitChip.equal')
    if (allEqual) {
      return t('splitChip.equalSubset', { count: positive.length, total: members.length })
    }
    return t('splitChip.custom')
  }, [splits, isSplitPayer, members.length, t])

  const onFormSubmit = async (data: ExpenseFormData) => {
    const amount = Math.round(parseFloat(data.amount) * 100)

    // splits only matters for SPLIT_PAYER; strip for any other payer to keep
    // the document shape clean.
    // Safety net: if the user picked SPLIT_PAYER but never configured amounts
    // (e.g. dismissed the editor), auto-seed to an equal split so the expense
    // is never persisted with invalid SPLIT data.
    let finalSplits: ExpenseSplit[] | undefined
    if (data.payer === SPLIT_PAYER) {
      if (splits && splits.length > 0 && splits.reduce((s, e) => s + e.shareCents, 0) === amount) {
        finalSplits = splits
      } else {
        const ratio = houseSplit.length > 0 ? houseSplit : makeEqualSplit(members.map((m) => m.uid))
        finalSplits = applyRatioToAmount(amount, ratio)
      }
    }

    await onSubmit(
      {
        amount,
        category: data.category as Expense['category'],
        payer: data.payer,
        description: data.description ?? '',
        date: data.date,
        paid: data.paid,
        splits: finalSplits,
      },
      files,
    )
    reset()
    setFiles([])
    setSplits(null)
    setInvalidatedNotice(false)
  }

  const resolvedSubmitLabel = submitLabel ?? t('expenses.addExpense')

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">{t('common.amount')}</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            {...register('amount')}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">{t('common.date')}</Label>
          <Input id="date" type="date" {...register('date')} />
          {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
        </div>
      </div>

      <div className={`grid grid-cols-1 ${isMultiMember ? 'sm:grid-cols-2' : ''} gap-4`}>
        <div className="space-y-2">
          <Label htmlFor="category">{t('filters.category')}</Label>
          <Select id="category" {...register('category')}>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            {EXPENSE_CATEGORIES.find((c) => c.value === watch('category'))?.hint}
          </p>
          {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
        </div>
        {isMultiMember ? (
          <Controller
            name="payer"
            control={control}
            render={({ field }) => (
              <div className="space-y-2">
                <Label htmlFor="payer">{t('expenses.paidBy')}</Label>
                <PayerSelect
                  id="payer"
                  value={field.value}
                  onChange={field.onChange}
                  members={members}
                  aria-invalid={!!errors.payer}
                />
                <p className="text-xs text-muted-foreground">
                  {field.value === SHARED_PAYER
                    ? t('expenses.paidShared')
                    : field.value === SPLIT_PAYER
                      ? t('expenses.paidSplit')
                      : t('expenses.paidPersonally', { name: members.find((m) => m.uid === field.value)?.displayName ?? 'member' })}
                </p>
                {errors.payer && <p className="text-xs text-destructive">{errors.payer.message}</p>}
              </div>
            )}
          />
        ) : (
          <input type="hidden" {...register('payer')} />
        )}
      </div>

      {/* Split editor chip — only when Split payment is chosen and there's an amount.
          This is the primary affordance for configuring per-person contributions. */}
      {isMultiMember && isSplitPayer && amountCents > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setSplitOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={splitOpen}
            className="group flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-left transition-colors hover:bg-primary/10 cursor-pointer"
          >
            <Users className="h-4 w-4 shrink-0" style={{ color: SPLIT_PAYER_COLOR }} />
            <span className="flex-1 min-w-0 truncate">
              <span className="font-medium text-primary">
                {splitSummary ?? t('splitChip.configure')}
              </span>
              <span className="text-muted-foreground"> — {t('splitChip.tapToAdjust')}</span>
            </span>
            {splits && splits.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground shrink-0 hidden sm:inline">
                {splits
                  .filter((s) => s.shareCents > 0)
                  .map((s) => formatCurrency(s.shareCents))
                  .join(' · ')}
              </span>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </button>
          {invalidatedNotice && (
            <p
              className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 pl-3"
              aria-live="polite"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {t('splitChip.amountChanged')}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="description">{t('expenses.description')}</Label>
        <Input id="description" placeholder={t('expenses.descriptionPlaceholder')} {...register('description')} />
      </div>

      <Controller
        name="paid"
        control={control}
        render={({ field }) => (
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="paid" className="cursor-pointer">{field.value ? t('expenses.paid') : t('expenses.unpaid')}</Label>
              <p className="text-xs text-muted-foreground">
                {field.value ? t('expenses.paidStatus') : t('expenses.unpaidStatus')}
              </p>
            </div>
            <Switch
              id="paid"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </div>
        )}
      />

      {!hideAttachments && (
        <div className="space-y-2">
          <Label>{t('expenses.attachments')} <span className="text-muted-foreground font-normal">({t('common.optional')})</span><InfoTooltip text={t('files.securityTooltip')} /></Label>
          <p className="text-xs text-muted-foreground -mt-1">{t('expenses.attachmentsHint')}</p>
          <FileDropZone files={files} onChange={setFiles} householdStorageUsed={storageUsed} />
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t('common.saving') : resolvedSubmitLabel}
      </Button>

      {isMultiMember && isSplitPayer && (
        <SplitEditor
          open={splitOpen}
          onOpenChange={setSplitOpen}
          amountCents={amountCents}
          members={members}
          houseSplit={houseSplit}
          value={splits}
          onSave={setSplits}
        />
      )}
    </form>
  )
}

