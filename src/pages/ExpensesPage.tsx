import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ExpenseList } from '@/components/expenses/ExpenseList'
import { QuickAddDialog } from '@/components/expenses/QuickAddDialog'

export function ExpensesPage() {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')

  const clearHighlight = useCallback(() => {
    setSearchParams(prev => {
      prev.delete('highlight')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.expenses')}</h1>
        <Button onClick={() => setDialogOpen(true)} className="hidden sm:flex">
          <Plus className="h-4 w-4 mr-2" />
          {t('expenses.addExpense')}
        </Button>
      </div>

      <ExpenseList highlightExpenseId={highlightId} onHighlightDone={clearHighlight} />

      <QuickAddDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {/* Mobile FAB */}
      <Button
        className="sm:hidden fixed right-4 h-12 rounded-full shadow-lg z-30 px-5"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="h-5 w-5 mr-1.5" />
        {t('expenses.addExpense')}
      </Button>
    </div>
  )
}
