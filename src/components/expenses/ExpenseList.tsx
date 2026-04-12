import { useState, useRef, useCallback, useMemo } from 'react'
import { Trash2, Edit2, Check, X, Paperclip, Plus, ArrowUpDown, Search, SlidersHorizontal, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { AttachmentViewer } from './AttachmentViewer'
import { EditExpenseDialog } from './EditExpenseDialog'
import { useExpenses } from '@/context/ExpenseContext'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency, friendlyError } from '@/lib/utils'
import { EXPENSE_CATEGORIES, CATEGORY_COLORS } from '@/lib/constants'
import { groupExpensesByMonth } from '@/lib/expense-utils'
import { format } from 'date-fns'
import type { Expense, Attachment } from '@/types/expense'

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return format(new Date(y, m - 1, 1), 'MMMM yyyy')
}

export function ExpenseList() {
  const { expenses, deleteExpense, addAttachmentsToExpense, removeAttachment, pendingExpenseIds, pendingAttachmentIds } = useExpenses()
  const { members, getMemberName, getMemberColor } = useHousehold()
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPayer, setFilterPayer] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'category' | 'payer'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

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
          case 'amount': return (a.amount - b.amount) * dir
          case 'category': return a.category.localeCompare(b.category) * dir
          case 'payer': return getMemberName(a.payer).localeCompare(getMemberName(b.payer)) * dir
          default: return a.date.localeCompare(b.date) * dir
        }
      })
  }, [expenses, filterCategory, filterPayer, filterFrom, filterTo, search, sortBy, sortDir, getMemberName])

  const filteredTotal = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered])
  const hasFilters = filterCategory || filterPayer || filterFrom || filterTo
  const activeFilterCount = [filterCategory, filterPayer, filterFrom, filterTo].filter(Boolean).length

  // Group by month when sorting by date (the default "daily check" view)
  const shouldGroup = sortBy === 'date'
  const grouped = useMemo(
    () => shouldGroup ? groupExpensesByMonth(filtered, sortDir) : [],
    [filtered, shouldGroup, sortDir]
  )

  const handleAttachmentClick = (expense: Expense, index: number) => {
    const att = expense.attachments?.[index]
    if (!att?.url) return
    if (att.type.startsWith('image/')) {
      const images = expense.attachments!.filter((a) => a.type.startsWith('image/'))
      setViewerAttachments(images)
      setViewerIndex(Math.max(0, images.indexOf(att)))
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

  // ── Expense row (shared between grouped and flat views) ──

  const renderExpenseRow = (expense: Expense) => {
    const isPendingExpense = pendingExpenseIds.has(expense.id)
    const categoryColor = CATEGORY_COLORS[expense.category] || '#6b7280'
    return (
      <div
        key={expense.id}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border border-l-[3px] bg-card transition-colors group/row ${isPendingExpense ? 'opacity-60' : 'hover:bg-accent/50'}`}
        style={{ borderLeftColor: categoryColor }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{formatCurrency(expense.amount)}</span>
            <span className="text-sm text-muted-foreground">{format(new Date(expense.date), 'MMM d, yyyy')}</span>
            <Badge variant="secondary">{categoryLabel(expense.category)}</Badge>
            <Badge variant="outline" className="gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0 inline-block"
                style={{ backgroundColor: getMemberColor(expense.payer) }}
              />
              {getMemberName(expense.payer)}
            </Badge>
            {(expense.attachments?.length ?? 0) > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Paperclip className="h-3 w-3" />
                {expense.attachments!.length}
              </span>
            )}
          </div>
          {expense.description && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{expense.description}</p>
          )}

          {/* Attachments */}
          {(expense.attachments?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {expense.attachments!.map((att, i) => {
                const isPendingAtt = pendingAttachmentIds.has(att.id)
                return (
                  <div
                    key={att.id}
                    role="button"
                    tabIndex={isPendingAtt ? undefined : 0}
                    onClick={isPendingAtt ? undefined : () => handleAttachmentClick(expense, i)}
                    onKeyDown={isPendingAtt ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAttachmentClick(expense, i); } }}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted transition-colors group ${isPendingAtt ? 'opacity-60' : 'hover:bg-muted-foreground/10 cursor-pointer'}`}
                    title={att.name}
                  >
                    {isPendingAtt
                      ? <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                      : <Paperclip className="h-3 w-3 text-muted-foreground" />
                    }
                    <span className="truncate max-w-[100px]">{att.name}</span>
                    {!isPendingAtt && (
                      <button
                        onClick={(e) => { e.stopPropagation(); withErrorHandling(async () => removeAttachment(expense.id, att.id)) }}
                        className="ml-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Remove"
                      >
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                )
              })}
              {!isPendingExpense && (
                <button
                  onClick={() => handleAddAttachment(expense.id)}
                  className="inline-flex items-center text-xs px-1.5 py-0.5 rounded border border-dashed border-input hover:border-primary/50 transition-colors cursor-pointer text-muted-foreground"
                  title="Add attachment"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {!isPendingExpense && (!expense.attachments || expense.attachments.length === 0) && (
            <button
              onClick={() => handleAddAttachment(expense.id)}
              className="inline-flex items-center gap-1 text-xs mt-1.5 px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer sm:opacity-0 sm:group-hover/row:opacity-100"
            >
              <Paperclip className="h-3 w-3" />
              <span>Attach</span>
            </button>
          )}
        </div>

        {/* Actions — visible on hover on desktop, always on mobile */}
        {isPendingExpense ? (
          <div className="flex items-center shrink-0 px-1">
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          </div>
        ) : (
        <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity">
          {deletingId === expense.id ? (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Confirm" onClick={() => { withErrorHandling(async () => { await deleteExpense(expense.id) }); setDeletingId(null) }}>
                <Check className="h-4 w-4 text-destructive" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Cancel" onClick={() => setDeletingId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingExpense(expense)}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeletingId(expense.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </>
          )}
        </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_TYPES} className="hidden" onChange={handleFileSelected} />

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

      {/* Filter toggle + sort */}
      <div className="flex gap-2 items-center">
        <Button
          variant={hasFilters ? 'default' : 'outline'}
          size="sm"
          className="h-9"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="h-4 w-4 mr-1.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1.5 h-5 w-5 rounded-full bg-primary-foreground text-primary text-xs flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <div className="ml-auto flex gap-1.5 items-center">
          <Select
            className="w-28"
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

      {/* Collapsible filters */}
      {showFilters && (
        <div className="flex gap-2 flex-wrap items-center p-3 rounded-lg border bg-muted/30">
          <Select
            className="w-[calc(50%-4px)] sm:w-40"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
          <Select
            className="w-[calc(50%-4px)] sm:w-36"
            value={filterPayer}
            onChange={(e) => setFilterPayer(e.target.value)}
          >
            <option value="">All members</option>
            {members.map((m) => (
              <option key={m.uid} value={m.uid}>{m.displayName}</option>
            ))}
          </Select>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-muted-foreground shrink-0">From</span>
            <Input
              type="date"
              className="flex-1 sm:flex-none sm:w-36"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
            <span className="text-xs text-muted-foreground shrink-0">to</span>
            <Input
              type="date"
              className="flex-1 sm:flex-none sm:w-36"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-primary hover:underline cursor-pointer ml-auto">
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
            {(hasFilters || search) && !showFilters && (
              <button onClick={clearFilters} className="ml-2 text-primary hover:underline cursor-pointer">
                Clear filters
              </button>
            )}
          </p>
          <p className="text-sm font-semibold">{formatCurrency(filteredTotal)}</p>
        </div>
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
                <button onClick={clearFilters} className="text-primary hover:underline cursor-pointer">clear all filters</button>
              </p>
            </>
          ) : (
            <>
              <p className="text-lg">No expenses yet</p>
              <p className="text-sm">Click the + button to add your first expense</p>
            </>
          )}
        </div>
      ) : shouldGroup ? (
        /* ── Month-grouped view (sorted by date) ── */
        <div>
          {grouped.map((group, groupIdx) => (
            <div key={group.key}>
              {/* Month header */}
              <div className={`sticky top-0 z-10 flex items-baseline justify-between pb-2 border-b border-border/60 bg-background ${groupIdx > 0 ? 'pt-5' : ''}`}>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold">{monthLabel(group.key)}</h2>
                  {group.isCurrent && (
                    <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full leading-none">
                      now
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-xs text-muted-foreground">
                    {group.expenses.length} expense{group.expenses.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-semibold">{formatCurrency(group.total)}</span>
                </div>
              </div>
              {/* Expense rows for this month */}
              <div className="space-y-1.5">
                {group.expenses.map(renderExpenseRow)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Flat list (sorted by amount, category, or payer) ── */
        <div className="space-y-1.5">
          {filtered.map(renderExpenseRow)}
        </div>
      )}

      <AttachmentViewer attachments={viewerAttachments} initialIndex={viewerIndex} open={viewerOpen} onOpenChange={setViewerOpen} />
      <EditExpenseDialog expense={editingExpense} onOpenChange={(open) => { if (!open) setEditingExpense(null) }} />
    </div>
  )
}
