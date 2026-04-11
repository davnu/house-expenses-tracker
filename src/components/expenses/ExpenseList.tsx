import { useState, useRef, useCallback } from 'react'
import { Trash2, Edit2, Check, X, Paperclip, Plus, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { AttachmentViewer } from './AttachmentViewer'
import { useExpenses } from '@/context/ExpenseContext'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency, friendlyError } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import { format } from 'date-fns'
import type { Expense, Attachment } from '@/types/expense'

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

export function ExpenseList() {
  const { expenses, deleteExpense, updateExpense, addAttachmentsToExpense, removeAttachment } = useExpenses()
  const { members, getMemberName } = useHousehold()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Expense>>({})
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPayer, setFilterPayer] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'category' | 'payer'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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

  const filtered = expenses
    .filter((e) => !filterCategory || e.category === filterCategory)
    .filter((e) => !filterPayer || e.payer === filterPayer)
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

  const startEdit = (expense: Expense) => {
    setEditingId(expense.id)
    setEditData({
      amount: expense.amount,
      description: expense.description,
      category: expense.category,
      payer: expense.payer,
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    await withErrorHandling(async () => {
      await updateExpense(editingId!, editData)
      setEditingId(null)
    })
  }

  const openViewer = (expense: Expense, index: number) => {
    if (!expense.attachments?.length) return
    setViewerAttachments(expense.attachments)
    setViewerIndex(index)
    setViewerOpen(true)
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

      {actionError && (
        <p className="text-sm text-destructive p-3 rounded-lg bg-destructive/5 border border-destructive/20">{actionError}</p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No expenses yet</p>
          <p className="text-sm">Click the + button to add your first expense</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((expense) => (
            <div
              key={expense.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              {editingId === expense.id ? (
                <>
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={(editData.amount ?? 0) / 100}
                      onChange={(e) => setEditData({ ...editData, amount: Math.round(parseFloat(e.target.value) * 100) })}
                    />
                    <Input
                      value={editData.description ?? ''}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    />
                    <Select
                      value={editData.category ?? ''}
                      onChange={(e) => setEditData({ ...editData, category: e.target.value as Expense['category'] })}
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </Select>
                    <Select
                      value={editData.payer ?? ''}
                      onChange={(e) => setEditData({ ...editData, payer: e.target.value })}
                    >
                      {members.map((m) => (
                        <option key={m.uid} value={m.uid}>{m.displayName}</option>
                      ))}
                    </Select>
                  </div>
                  <Button size="icon" variant="ghost" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{formatCurrency(expense.amount)}</span>
                      <Badge variant="secondary">{categoryLabel(expense.category)}</Badge>
                      <Badge variant="outline">{getMemberName(expense.payer)}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 truncate">
                      {expense.description} &middot; {format(new Date(expense.date), 'MMM d, yyyy')}
                    </div>

                    {/* Attachments row */}
                    {(expense.attachments?.length ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {expense.attachments!.map((att, i) => (
                          <button
                            key={att.id}
                            onClick={() => openViewer(expense, i)}
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

                    {(!expense.attachments || expense.attachments.length === 0) && (
                      <button
                        onClick={() => handleAddAttachment(expense.id)}
                        className="inline-flex items-center gap-1 text-xs mt-2 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                        title="Add attachment"
                      >
                        <Paperclip className="h-3 w-3" />
                        <span>Attach file</span>
                      </button>
                    )}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => startEdit(expense)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteExpense(expense.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
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
    </div>
  )
}
