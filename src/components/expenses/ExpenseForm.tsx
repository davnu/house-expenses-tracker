import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { FileDropZone } from './FileDropZone'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import { useHousehold } from '@/context/HouseholdContext'
import { useExpenses } from '@/context/ExpenseContext'
import { useAuth } from '@/context/AuthContext'
import { format } from 'date-fns'
import type { Expense } from '@/types/expense'

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
  hideAttachments?: boolean
  submitLabel?: string
}

export function ExpenseForm({ onSubmit, defaultValues, hideAttachments, submitLabel = 'Add Expense' }: ExpenseFormProps) {
  const [files, setFiles] = useState<File[]>([])
  const { members } = useHousehold()
  const { storageUsed } = useExpenses()
  const { user } = useAuth()

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: '',
      category: 'other',
      payer: user?.uid ?? '',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      ...defaultValues,
    },
  })

  const onFormSubmit = async (data: ExpenseFormData) => {
    await onSubmit(
      {
        amount: Math.round(parseFloat(data.amount) * 100),
        category: data.category as Expense['category'],
        payer: data.payer,
        description: data.description ?? '',
        date: data.date,
      },
      files
    )
    reset()
    setFiles([])
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
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
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" {...register('date')} />
          {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
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

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" placeholder="What was this for?" {...register('description')} />
      </div>

      {!hideAttachments && (
        <div className="space-y-2">
          <Label>Attachments <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <p className="text-xs text-muted-foreground -mt-1">Receipts, contracts, invoices, photos — keep everything in one place</p>
          <FileDropZone files={files} onChange={setFiles} householdStorageUsed={storageUsed} />
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel}
      </Button>
    </form>
  )
}
