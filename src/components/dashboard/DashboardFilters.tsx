import { useState } from 'react'
import { Filter, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useHousehold } from '@/context/HouseholdContext'
import { EXPENSE_CATEGORIES, SHARED_PAYER, SHARED_PAYER_COLOR, SHARED_PAYER_LABEL } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { DashboardFilters as Filters } from '@/lib/expense-utils'
import type { ExpenseCategory } from '@/types/expense'
import { subMonths, format } from 'date-fns'

interface DashboardFiltersProps {
  filters: Filters
  onChange: (filters: Filters) => void
  usedCategories: ExpenseCategory[]
}

const DATE_PRESETS = [
  { label: 'All time', value: 'all' },
  { label: 'This month', value: 'month' },
  { label: 'Last 3 months', value: '3months' },
  { label: 'This year', value: 'year' },
  { label: 'Custom', value: 'custom' },
]

function getPresetDates(preset: string): { start?: string; end?: string } {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  switch (preset) {
    case 'month':
      return { start: format(today, 'yyyy-MM-01'), end: todayStr }
    case '3months':
      return { start: format(subMonths(today, 3), 'yyyy-MM-dd'), end: todayStr }
    case 'year':
      return { start: format(today, 'yyyy-01-01'), end: todayStr }
    default:
      return {}
  }
}

export function DashboardFilters({ filters, onChange, usedCategories }: DashboardFiltersProps) {
  const { members } = useHousehold()
  const [expanded, setExpanded] = useState(false)
  const [datePreset, setDatePreset] = useState('all')

  const activeCount = [filters.dateStart, filters.payer, filters.category].filter(Boolean).length

  const setDateFilter = (preset: string) => {
    setDatePreset(preset)
    if (preset === 'custom') return
    const { start, end } = getPresetDates(preset)
    onChange({ ...filters, dateStart: start, dateEnd: end })
  }

  const clearAll = () => {
    setDatePreset('all')
    onChange({})
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer hover:bg-accent/50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 font-medium">
              {activeCount}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          {/* Date range */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Date range</p>
            <div className="flex gap-1.5 flex-wrap">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setDateFilter(p.value)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                    datePreset === p.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-input hover:bg-accent'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {datePreset === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 mt-2 sm:items-center">
                <Input
                  type="date"
                  value={filters.dateStart ?? ''}
                  max={filters.dateEnd ?? undefined}
                  onChange={(e) => onChange({ ...filters, dateStart: e.target.value })}
                  className="text-xs h-8"
                  aria-label="Start date"
                />
                <span className="text-xs text-muted-foreground hidden sm:block">to</span>
                <Input
                  type="date"
                  value={filters.dateEnd ?? ''}
                  min={filters.dateStart ?? undefined}
                  onChange={(e) => onChange({ ...filters, dateEnd: e.target.value })}
                  className="text-xs h-8"
                  aria-label="End date"
                />
              </div>
            )}
          </div>

          {/* Person */}
          {members.length > 1 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Person</p>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => onChange({ ...filters, payer: undefined })}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                    !filters.payer
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-input hover:bg-accent'
                  )}
                >
                  All
                </button>
                <button
                  onClick={() => onChange({ ...filters, payer: filters.payer === SHARED_PAYER ? undefined : SHARED_PAYER })}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer flex items-center gap-1.5',
                    filters.payer === SHARED_PAYER
                      ? 'text-white border-transparent'
                      : 'border-input hover:bg-accent'
                  )}
                  style={filters.payer === SHARED_PAYER ? { backgroundColor: SHARED_PAYER_COLOR } : undefined}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: SHARED_PAYER_COLOR }} />
                  {SHARED_PAYER_LABEL}
                </button>
                {members.map((m) => (
                  <button
                    key={m.uid}
                    onClick={() => onChange({ ...filters, payer: filters.payer === m.uid ? undefined : m.uid })}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer flex items-center gap-1.5',
                      filters.payer === m.uid
                        ? 'text-white border-transparent'
                        : 'border-input hover:bg-accent'
                    )}
                    style={filters.payer === m.uid ? { backgroundColor: m.color } : undefined}
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    {m.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category */}
          {usedCategories.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Category</p>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => onChange({ ...filters, category: undefined })}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                    !filters.category
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-input hover:bg-accent'
                  )}
                >
                  All
                </button>
                {EXPENSE_CATEGORIES
                  .filter((c) => usedCategories.includes(c.value as ExpenseCategory))
                  .map((c) => (
                    <button
                      key={c.value}
                      onClick={() => onChange({ ...filters, category: filters.category === c.value ? undefined : c.value as ExpenseCategory })}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                        filters.category === c.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-input hover:bg-accent'
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Clear all */}
          {activeCount > 0 && (
            <Button size="sm" variant="ghost" onClick={clearAll} className="text-xs">
              <X className="h-3 w-3 mr-1" />
              Clear all filters
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
