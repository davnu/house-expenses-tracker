import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ExpenseForm } from './ExpenseForm'
import { useExpenses } from '@/context/ExpenseContext'
import { friendlyError } from '@/lib/utils'
import type { Expense } from '@/types/expense'

interface EditExpenseDialogProps {
  expense: Expense | null
  onOpenChange: (open: boolean) => void
}

export function EditExpenseDialog({ expense, onOpenChange }: EditExpenseDialogProps) {
  const { updateExpense } = useExpenses()
  const [error, setError] = useState('')

  const handleSubmit = async (data: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!expense) return
    setError('')
    try {
      await updateExpense(expense.id, {
        amount: data.amount,
        category: data.category,
        payer: data.payer,
        description: data.description,
        date: data.date,
      })
      onOpenChange(false)
    } catch (err) {
      setError(friendlyError(err, 'Failed to update expense. Please try again.'))
    }
  }

  if (!expense) return null

  return (
    <Dialog open={!!expense} onOpenChange={(v) => { setError(''); onOpenChange(v) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ExpenseForm
          onSubmit={(data) => handleSubmit(data)}
          defaultValues={{
            amount: (expense.amount / 100).toString(),
            category: expense.category,
            payer: expense.payer,
            description: expense.description,
            date: expense.date,
          }}
          hideAttachments
          submitLabel="Save Changes"
        />
      </DialogContent>
    </Dialog>
  )
}
