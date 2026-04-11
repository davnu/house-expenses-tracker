import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ExpenseForm } from './ExpenseForm'
import { useExpenses } from '@/context/ExpenseContext'
import { friendlyError } from '@/lib/utils'
import type { Expense } from '@/types/expense'

interface QuickAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuickAddDialog({ open, onOpenChange }: QuickAddDialogProps) {
  const { addExpenseWithFiles } = useExpenses()
  const [error, setError] = useState('')

  const handleSubmit = async (data: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, files: File[]) => {
    setError('')
    try {
      await addExpenseWithFiles(data, files)
      onOpenChange(false)
    } catch (err) {
      setError(friendlyError(err, 'Failed to save expense. Please try again.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setError(''); onOpenChange(v) }}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ExpenseForm onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  )
}
