import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Edit2, Check, X, Paperclip, Plus, ArrowUpDown, Search, SlidersHorizontal, Loader2, CircleCheck, Circle } from 'lucide-react'
import { getFileTypeInfo, getExtensionBadgeClasses } from '@/lib/file-type-info'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { AttachmentViewer } from './AttachmentViewer'
import { EditExpenseDialog } from './EditExpenseDialog'
import { useExpenses } from '@/context/ExpenseContext'
import { useHousehold } from '@/context/HouseholdContext'
import { cn, formatCurrency, friendlyError, getDateLocale } from '@/lib/utils'
import { EXPENSE_CATEGORIES, CATEGORY_COLORS, SHARED_PAYER, SPLIT_PAYER, UNPAID_BADGE_CLASSES, getSharedPayerLabel, getSplitPayerLabel, getCategoryLabel } from '@/lib/constants'
import { validateExpenseAttachments, rejectionMessage } from '@/lib/attachment-validation'
import { filterByPayer, groupExpensesByMonth, isExpensePaid } from '@/lib/expense-utils'
import { format } from 'date-fns'
import type { Expense, Attachment } from '@/types/expense'

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return format(new Date(y, m - 1, 1), 'MMMM yyyy', { locale: getDateLocale() })
}

interface ExpenseListProps {
  highlightExpenseId?: string | null
  onHighlightDone?: () => void
}

export function ExpenseList({ highlightExpenseId, onHighlightDone }: ExpenseListProps) {
  const { t } = useTranslation()
  const { expenses, deleteExpense, updateExpense, addAttachmentsToExpense, removeAttachment, pendingExpenseIds, pendingAttachmentIds, storageUsed } = useExpenses()
  const { members, getMemberName, getMemberColor } = useHousehold()
  const isMultiMember = members.length > 1
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPayer, setFilterPayer] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterStatus, setFilterStatus] = useState<'' | 'paid' | 'unpaid'>('')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'category' | 'payer' | 'status'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerAttachments, setViewerAttachments] = useState<Attachment[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  // ── Deep-link highlight ──
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const setRowRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }, [])
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null)
  const onHighlightDoneRef = useRef(onHighlightDone)
  onHighlightDoneRef.current = onHighlightDone
  const didHighlightRef = useRef<string | null>(null)

  // Reset completion guard and clear filters when a new highlight arrives
  useEffect(() => {
    didHighlightRef.current = null
    if (highlightExpenseId) {
      setFilterCategory('')
      setFilterPayer('')
      setFilterFrom('')
      setFilterTo('')
      setFilterStatus('')
      setSearch('')
    }
  }, [highlightExpenseId])

  // Scroll to and highlight the target expense
  useEffect(() => {
    if (!highlightExpenseId || didHighlightRef.current === highlightExpenseId) return

    const fallbackTimeout = setTimeout(() => {
      // Expense not found after 5s (deleted or stale link) — clean up
      onHighlightDoneRef.current?.()
    }, 5000)

    let fadeTimeout: ReturnType<typeof setTimeout>
    const raf = requestAnimationFrame(() => {
      const el = rowRefs.current.get(highlightExpenseId)
      if (!el) return

      clearTimeout(fallbackTimeout)
      didHighlightRef.current = highlightExpenseId
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setActiveHighlight(highlightExpenseId)

      // 3s total: ~800ms for smooth scroll to settle + ~2.2s visible highlight
      fadeTimeout = setTimeout(() => {
        setActiveHighlight(null)
        onHighlightDoneRef.current?.()
      }, 3000)
    })

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fallbackTimeout)
      clearTimeout(fadeTimeout)
    }
  }, [highlightExpenseId, expenses]) // re-run when expenses load

  const withErrorHandling = useCallback(async (fn: () => Promise<void>) => {
    setActionError('')
    try { await fn() } catch (err) { setActionError(friendlyError(err)) }
  }, [])

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase()
    const payerFiltered = filterPayer ? filterByPayer(expenses, filterPayer) : expenses
    return payerFiltered
      .filter((e) => !filterCategory || e.category === filterCategory)
      .filter((e) => !filterFrom || e.date >= filterFrom)
      .filter((e) => !filterTo || e.date <= filterTo)
      .filter((e) => !filterStatus || (filterStatus === 'paid' ? isExpensePaid(e) : !isExpensePaid(e)))
      .filter((e) => !search || e.description.toLowerCase().includes(searchLower) || getCategoryLabel(e.category).toLowerCase().includes(searchLower))
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        switch (sortBy) {
          case 'amount': return (a.amount - b.amount) * dir
          case 'category': return a.category.localeCompare(b.category) * dir
          case 'payer': return getMemberName(a.payer).localeCompare(getMemberName(b.payer)) * dir
          case 'status': {
            const s = (Number(isExpensePaid(a)) - Number(isExpensePaid(b))) * dir
            return s !== 0 ? s : b.date.localeCompare(a.date) // secondary: newest first
          }
          default: return a.date.localeCompare(b.date) * dir
        }
      })
  }, [expenses, filterCategory, filterPayer, filterFrom, filterTo, filterStatus, search, sortBy, sortDir, getMemberName])

  const filteredTotal = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered])
  const hasFilters = filterCategory || filterPayer || filterFrom || filterTo || filterStatus
  const activeFilterCount = [filterCategory, filterPayer, filterFrom, filterTo, filterStatus].filter(Boolean).length

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
    // Reset the target regardless of outcome so a second attempt on a different
    // expense can't misroute if the first failed validation.
    setAttachTargetId(null)

    const target = expenses.find((x) => x.id === targetId)
    const { accepted, rejection } = validateExpenseAttachments(files, {
      existingCount: target?.attachments?.length ?? 0,
      householdStorageUsed: storageUsed,
    })
    // Set the validation error directly — we deliberately do NOT use
    // withErrorHandling() here because it would clear this message before
    // the upload runs, and the user would never see why their oversize file
    // was skipped in a mixed batch. The upload's own try/catch still
    // surfaces real Firebase/network failures.
    setActionError(rejection ? rejectionMessage(t, rejection) : '')
    if (accepted.length === 0) return
    try {
      await addAttachmentsToExpense(targetId, accepted)
    } catch (err) {
      setActionError(friendlyError(err))
    }
  }

  const clearFilters = () => {
    setFilterCategory('')
    setFilterPayer('')
    setFilterFrom('')
    setFilterTo('')
    setFilterStatus('')
    setSearch('')
  }

  // ── Expense row (shared between grouped and flat views) ──

  const togglePaid = useCallback((expense: Expense) => {
    const newPaid = !isExpensePaid(expense)
    withErrorHandling(async () => updateExpense(expense.id, { paid: newPaid }))
  }, [updateExpense, withErrorHandling])

  const renderExpenseRow = (expense: Expense) => {
    const isPendingExpense = pendingExpenseIds.has(expense.id)
    const isHighlighted = activeHighlight === expense.id
    const categoryColor = CATEGORY_COLORS[expense.category] || '#6b7280'
    const paid = isExpensePaid(expense)
    return (
      <div
        key={expense.id}
        ref={setRowRef(expense.id)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg border border-l-[3px] bg-card group/row',
          'transition-[background-color,box-shadow] duration-500',
          isPendingExpense ? 'opacity-60' : 'hover:bg-accent/50',
          isHighlighted && 'ring-2 ring-primary bg-primary/5',
          !paid && 'border-dashed',
        )}
        style={{ borderLeftColor: categoryColor }}
      >
        {/* Paid toggle */}
        <button
          className={cn(
            'shrink-0 p-1.5 -m-1.5 rounded-full transition-colors cursor-pointer',
            isPendingExpense && 'pointer-events-none',
            paid ? 'text-primary hover:text-primary/70' : 'text-amber-500 hover:text-amber-600',
          )}
          onClick={() => togglePaid(expense)}
          title={paid ? t('expenses.markAsUnpaid') : t('expenses.markAsPaid')}
        >
          {paid
            ? <CircleCheck className="h-5 w-5" />
            : <Circle className="h-5 w-5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('font-semibold', !paid && 'text-muted-foreground')}>{formatCurrency(expense.amount)}</span>
            <span className="text-sm text-muted-foreground">{format(new Date(expense.date), 'MMM d, yyyy', { locale: getDateLocale() })}</span>
            <Badge variant="secondary">{getCategoryLabel(expense.category)}</Badge>
            {!paid && (
              <Badge variant="outline" className={UNPAID_BADGE_CLASSES}>
                {t('expenses.unpaid')}
              </Badge>
            )}
            {isMultiMember && expense.payer === SPLIT_PAYER ? (() => {
              // Split payment: show a rich badge with the per-person breakdown
              // as a tooltip so users can scan the list without opening each one.
              const splits = expense.splits ?? []
              const positive = splits.filter((s) => s.shareCents > 0)
              const title = positive.length > 0
                ? positive.map((s) => `${getMemberName(s.uid)} ${formatCurrency(s.shareCents)}`).join(' · ')
                : getSplitPayerLabel()
              const overflow = positive.length - 3
              return (
                <Badge variant="outline" className="gap-1" title={title}>
                  <span className="flex -space-x-1">
                    {positive.slice(0, 3).map((s) => (
                      <span
                        key={s.uid}
                        className="h-2 w-2 rounded-full ring-1 ring-background"
                        style={{ backgroundColor: getMemberColor(s.uid) }}
                      />
                    ))}
                  </span>
                  {getSplitPayerLabel()}
                  {overflow > 0 && (
                    <span className="text-[10px] text-muted-foreground font-medium">
                      +{overflow}
                    </span>
                  )}
                </Badge>
              )
            })() : isMultiMember && (
              <Badge variant="outline" className="gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0 inline-block"
                  style={{ backgroundColor: getMemberColor(expense.payer) }}
                />
                {getMemberName(expense.payer)}
              </Badge>
            )}
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
                const typeInfo = getFileTypeInfo(att.type)
                return (
                  <div
                    key={att.id}
                    role="button"
                    tabIndex={isPendingAtt ? undefined : 0}
                    onClick={isPendingAtt ? undefined : () => handleAttachmentClick(expense, i)}
                    onKeyDown={isPendingAtt ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAttachmentClick(expense, i); } }}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs rounded-lg transition-colors group overflow-hidden',
                      isPendingAtt ? 'opacity-60 bg-muted px-2 py-1' : 'hover:ring-1 hover:ring-primary/30 cursor-pointer',
                      !att.thumbnailUrl || isPendingAtt ? 'bg-muted px-2 py-1' : ''
                    )}
                    title={att.name}
                  >
                    {isPendingAtt ? (
                      <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                    ) : att.thumbnailUrl ? (
                      <img src={att.thumbnailUrl} alt="" className="h-7 w-7 object-cover rounded-md shrink-0" />
                    ) : (
                      <span className={cn('inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold leading-none', getExtensionBadgeClasses(att.type))}>
                        {typeInfo.label}
                      </span>
                    )}
                    <span className="truncate max-w-[100px]">{att.name}</span>
                    {!isPendingAtt && (
                      <button
                        onClick={(e) => { e.stopPropagation(); withErrorHandling(async () => removeAttachment(expense.id, att.id)) }}
                        className="ml-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                        title={t('common.remove')}
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
                  className="inline-flex items-center text-xs px-1.5 py-1 rounded-lg border border-dashed border-input hover:border-primary/50 transition-colors cursor-pointer text-muted-foreground"
                  title={t('common.attach')}
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
              <span>{t('common.attach')}</span>
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
              <Button size="icon" variant="ghost" className="h-8 w-8" title={t('common.confirm')} onClick={() => { withErrorHandling(async () => { await deleteExpense(expense.id) }); setDeletingId(null) }}>
                <Check className="h-4 w-4 text-destructive" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" title={t('common.cancel')} onClick={() => setDeletingId(null)}>
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
          placeholder={t('expenses.searchExpenses')}
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
          {t('filters.filters')}
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
            <option value="date">{t('common.date')}</option>
            <option value="amount">{t('common.amount')}</option>
            <option value="category">{t('filters.category')}</option>
            {isMultiMember && <option value="payer">{t('expenses.member')}</option>}
            <option value="status">{t('filters.status')}</option>
          </Select>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            title={sortDir === 'asc' ? t('common.ascending') : t('common.descending')}
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
            <option value="">{t('filters.allCategories')}</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
          {isMultiMember && (
            <Select
              className="w-[calc(50%-4px)] sm:w-36"
              value={filterPayer}
              onChange={(e) => setFilterPayer(e.target.value)}
            >
              <option value="">{t('filters.allMembers')}</option>
              <option value={SHARED_PAYER}>{getSharedPayerLabel()}</option>
              <option value={SPLIT_PAYER}>{getSplitPayerLabel()}</option>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>{m.displayName}</option>
              ))}
            </Select>
          )}
          <Select
            className="w-[calc(50%-4px)] sm:w-32"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          >
            <option value="">{t('filters.allStatuses')}</option>
            <option value="paid">{t('expenses.paid')}</option>
            <option value="unpaid">{t('expenses.unpaid')}</option>
          </Select>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-muted-foreground shrink-0">{t('common.from')}</span>
            <Input
              type="date"
              className="flex-1 sm:flex-none sm:w-36"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
            <span className="text-xs text-muted-foreground shrink-0">{t('common.to')}</span>
            <Input
              type="date"
              className="flex-1 sm:flex-none sm:w-36"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-primary hover:underline cursor-pointer ml-auto">
              {t('common.clearAll')}
            </button>
          )}
        </div>
      )}

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('expenses.expenseCount', { count: filtered.length })}
            {(hasFilters || search) && !showFilters && (
              <button onClick={clearFilters} className="ml-2 text-primary hover:underline cursor-pointer">
                {t('expenses.clearFilters')}
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
              <p className="text-lg">{t('expenses.noMatchingExpenses')}</p>
              <p className="text-sm">
                {t('expenses.tryAdjustingFilters')}{' '}
                <button onClick={clearFilters} className="text-primary hover:underline cursor-pointer">{t('expenses.clearAllFilters')}</button>
              </p>
            </>
          ) : (
            <>
              <p className="text-lg">{t('expenses.noCostsLogged')}</p>
              <p className="text-sm">{t('expenses.tapToLog')}</p>
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
                      {t('expenses.now')}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t('expenses.expenseCount', { count: group.expenses.length })}
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

      {viewerOpen && (
        <AttachmentViewer
          attachments={viewerAttachments}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
      <EditExpenseDialog expense={editingExpense} onOpenChange={(open) => { if (!open) setEditingExpense(null) }} />
    </div>
  )
}
