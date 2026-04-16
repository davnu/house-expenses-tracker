import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
        paid: data.paid,
      })
      onOpenChange(false)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  if (!expense) return null

  return (
    <Dialog open={!!expense} onOpenChange={(v) => { setError(''); onOpenChange(v) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('expenses.editExpense')}</DialogTitle>
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
            paid: expense.paid !== false,
          }}
          hideAttachments
          submitLabel={t('expenses.saveChanges')}
        />
      </DialogContent>
    </Dialog>
  )
}
