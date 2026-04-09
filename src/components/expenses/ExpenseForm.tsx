import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { FileDropZone } from './FileDropZone'
import { EXPENSE_CATEGORIES, CATEGORY_COST_PHASE } from '@/lib/constants'
import { useHousehold } from '@/context/HouseholdContext'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { Expense, CostPhase } from '@/types/expense'

const expenseSchema = z.object({
  amount: z.string().min(1, 'Required').refine((v) => parseFloat(v) > 0, 'Must be positive'),
  category: z.string().min(1, 'Required'),
  payer: z.string().min(1, 'Required'),
  description: z.string().optional(),
  date: z.string().min(1, 'Required'),
})

type ExpenseFormData = z.infer<typeof expenseSchema>

interface ExpenseFormProps {
  onSubmit: (data: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, files: File[]) => Promise<void>
  defaultValues?: Partial<ExpenseFormData>
  submitLabel?: string
}

export function ExpenseForm({ onSubmit, defaultValues, submitLabel = 'Add Expense' }: ExpenseFormProps) {
  const [files, setFiles] = useState<File[]>([])
  const [costPhase, setCostPhase] = useState<CostPhase>('one-time')
  const { members } = useHousehold()
  const { user } = useAuth()

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: '',
      category: 'mortgage',
      payer: user?.uid ?? '',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      ...defaultValues,
    },
  })

  // Auto-set costPhase when category changes
  const watchedCategory = watch('category')
  useEffect(() => {
    const phase = CATEGORY_COST_PHASE[watchedCategory] ?? 'one-time'
    setCostPhase(phase)
  }, [watchedCategory])

  const onFormSubmit = async (data: ExpenseFormData) => {
    await onSubmit(
      {
        amount: Math.round(parseFloat(data.amount) * 100),
        category: data.category as Expense['category'],
        payer: data.payer,
        description: data.description ?? '',
        date: data.date,
        costPhase,
      },
      files
    )
    reset()
    setFiles([])
    setCostPhase('one-time')
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            autoFocus
            {...register('amount')}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" {...register('date')} />
          {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select id="category" {...register('category')}>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </Select>
          {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="payer">Paid by</Label>
          <Select id="payer" {...register('payer')}>
            {members.map((m) => (
              <option key={m.uid} value={m.uid}>{m.displayName}</option>
            ))}
          </Select>
          {errors.payer && <p className="text-xs text-destructive">{errors.payer.message}</p>}
        </div>
      </div>

      {/* Cost phase toggle */}
      <div className="space-y-2">
        <Label>Cost type</Label>
        <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setCostPhase('one-time')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
              costPhase === 'one-time'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            One-time (Purchase)
          </button>
          <button
            type="button"
            onClick={() => setCostPhase('ongoing')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
              costPhase === 'ongoing'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Ongoing (Monthly)
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" placeholder="What was this for?" {...register('description')} />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Attachments</Label>
        <FileDropZone files={files} onChange={setFiles} />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel}
      </Button>
    </form>
  )
}
