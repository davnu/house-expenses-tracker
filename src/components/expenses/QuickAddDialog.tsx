import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ExpenseForm } from './ExpenseForm'
import { useExpenses } from '@/context/ExpenseContext'
import type { Expense } from '@/types/expense'

interface QuickAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuickAddDialog({ open, onOpenChange }: QuickAddDialogProps) {
  const { addExpenseWithFiles } = useExpenses()

  const handleSubmit = async (data: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, files: File[]) => {
    await addExpenseWithFiles(data, files)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <ExpenseForm onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  )
}
