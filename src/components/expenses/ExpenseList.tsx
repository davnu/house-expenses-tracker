import { useState, useRef, useCallback, useMemo } from 'react'
import { Trash2, Edit2, Check, X, Paperclip, Plus, ArrowUpDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { AttachmentViewer } from './AttachmentViewer'
import { EditExpenseDialog } from './EditExpenseDialog'
import { useExpenses } from '@/context/ExpenseContext'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency, friendlyError } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import { format } from 'date-fns'
import type { Expense, Attachment } from '@/types/expense'

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

export function ExpenseList() {
  const { expenses, deleteExpense, addAttachmentsToExpense, removeAttachment } = useExpenses()
  const { members, getMemberName } = useHousehold()
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPayer, setFilterPayer] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'category' | 'payer'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  // Attachment viewer state
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerAttachments, setViewerAttachments] = useState<Attachment[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const withErrorHandling = useCallback(async (fn: () => Promise<void>) => {
    setActionError('')
    try { await fn() } catch (err) { setActionError(friendlyError(err)) }
  }, [])

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase()
    return expenses
      .filter((e) => !filterCategory || e.category === filterCategory)
      .filter((e) => !filterPayer || e.payer === filterPayer)
      .filter((e) => !filterFrom || e.date >= filterFrom)
      .filter((e) => !filterTo || e.date <= filterTo)
      .filter((e) => !search || e.description.toLowerCase().includes(searchLower) || categoryLabel(e.category).toLowerCase().includes(searchLower))
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        switch (sortBy) {
          case 'amount':
            return (a.amount - b.amount) * dir
          case 'category':
            return a.category.localeCompare(b.category) * dir
          case 'payer':
            return getMemberName(a.payer).localeCompare(getMemberName(b.payer)) * dir
          default:
            return a.date.localeCompare(b.date) * dir
        }
      })
  }, [expenses, filterCategory, filterPayer, filterFrom, filterTo, search, sortBy, sortDir, getMemberName])

  const filteredTotal = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered])

  const handleAttachmentClick = (expense: Expense, index: number) => {
    const att = expense.attachments?.[index]
    if (!att?.url) return

    if (att.type.startsWith('image/')) {
      const images = expense.attachments!.filter((a) => a.type.startsWith('image/'))
      const imageIndex = images.indexOf(att)
      setViewerAttachments(images)
      setViewerIndex(Math.max(0, imageIndex))
      setViewerOpen(true)
    } else if (att.type === 'application/pdf') {
      window.open(att.url, '_blank', 'noopener,noreferrer')
    } else {
      const a = document.createElement('a')
      a.href = att.url
      a.download = att.name
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
    }
  }

  const handleAddAttachment = (expenseId: string) => {
    setAttachTargetId(expenseId)
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!attachTargetId || !e.target.files?.length) return
    const targetId = attachTargetId
    const files = Array.from(e.target.files)
    e.target.value = ''
    await withErrorHandling(async () => {
      await addAttachmentsToExpense(targetId, files)
      setAttachTargetId(null)
    })
  }

  const clearFilters = () => {
    setFilterCategory('')
    setFilterPayer('')
    setFilterFrom('')
    setFilterTo('')
    setSearch('')
  }

  const hasFilters = filterCategory || filterPayer || filterFrom || filterTo || search

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search expenses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters & Sort */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select
          className="w-40"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
        <Select
          className="w-36"
          value={filterPayer}
          onChange={(e) => setFilterPayer(e.target.value)}
        >
          <option value="">All members</option>
          {members.map((m) => (
            <option key={m.uid} value={m.uid}>{m.displayName}</option>
          ))}
        </Select>
        <Input
          type="date"
          className="w-36"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          placeholder="From"
          title="From date"
        />
        <Input
          type="date"
          className="w-36"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          placeholder="To"
          title="To date"
        />

        <div className="ml-auto flex gap-1.5 items-center">
          <Select
            className="w-32"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
            <option value="category">Category</option>
            <option value="payer">Member</option>
          </Select>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} expense{filtered.length !== 1 ? 's' : ''} &middot; {formatCurrency(filteredTotal)}
          {hasFilters && (
            <button onClick={clearFilters} className="ml-2 text-primary hover:underline cursor-pointer">
              Clear filters
            </button>
          )}
        </p>
      )}

      {actionError && (
        <p className="text-sm text-destructive p-3 rounded-lg bg-destructive/5 border border-destructive/20">{actionError}</p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {expenses.length > 0 ? (
            <>
              <p className="text-lg">No matching expenses</p>
              <p className="text-sm">
                Try adjusting your filters or{' '}
                <button onClick={clearFilters} className="text-primary hover:underline cursor-pointer">
                  clear all filters
                </button>
              </p>
            </>
          ) : (
            <>
              <p className="text-lg">No expenses yet</p>
              <p className="text-sm">Click the + button to add your first expense</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((expense) => (
            <div
              key={expense.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group/row"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{formatCurrency(expense.amount)}</span>
                  <span className="text-sm text-muted-foreground">{format(new Date(expense.date), 'MMM d, yyyy')}</span>
                  <Badge variant="secondary">{categoryLabel(expense.category)}</Badge>
                  <Badge variant="outline">{getMemberName(expense.payer)}</Badge>
                </div>
                {expense.description && (
                  <p className="text-sm text-muted-foreground mt-1 truncate">{expense.description}</p>
                )}

                {/* Attachments row */}
                {(expense.attachments?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {expense.attachments!.map((att, i) => (
                      <button
                        key={att.id}
                        onClick={() => handleAttachmentClick(expense, i)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted-foreground/10 transition-colors cursor-pointer group"
                        title={att.name}
                      >
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate max-w-[120px]">{att.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeAttachment(expense.id, att.id)
                          }}
                          className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Remove attachment"
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </button>
                    ))}
                    <button
                      onClick={() => handleAddAttachment(expense.id)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-input hover:border-primary/50 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                      title="Add attachment"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Attach file — only visible on hover */}
                {(!expense.attachments || expense.attachments.length === 0) && (
                  <button
                    onClick={() => handleAddAttachment(expense.id)}
                    className="inline-flex items-center gap-1 text-xs mt-2 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer opacity-0 group-hover/row:opacity-100"
                    title="Add attachment"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span>Attach file</span>
                  </button>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => setEditingExpense(expense)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              {deletingId === expense.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Confirm delete"
                    onClick={() => {
                      withErrorHandling(async () => { await deleteExpense(expense.id) })
                      setDeletingId(null)
                    }}
                  >
                    <Check className="h-4 w-4 text-destructive" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Cancel" onClick={() => setDeletingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button size="icon" variant="ghost" onClick={() => setDeletingId(expense.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <AttachmentViewer
        attachments={viewerAttachments}
        initialIndex={viewerIndex}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
      />

      <EditExpenseDialog
        expense={editingExpense}
        onOpenChange={(open) => { if (!open) setEditingExpense(null) }}
      />
    </div>
  )
}
