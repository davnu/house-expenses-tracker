import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExpenseList } from '@/components/expenses/ExpenseList'
import { QuickAddDialog } from '@/components/expenses/QuickAddDialog'

export function ExpensesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <Button onClick={() => setDialogOpen(true)} className="hidden sm:flex">
          <Plus className="h-4 w-4 mr-2" />
          Add Expense
        </Button>
      </div>

      <ExpenseList />

      <QuickAddDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {/* Mobile FAB */}
      <Button
        size="lg"
        className="sm:hidden fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg z-30"
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  )
}
