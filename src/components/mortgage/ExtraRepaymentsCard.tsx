import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useMortgage } from '@/context/MortgageContext'
import { calculateMortgageImpact } from '@/lib/mortgage-utils'
import { formatCurrency, cn, getDateLocale } from '@/lib/utils'
import { format } from 'date-fns'
import type { MortgageConfig, ExtraRepayment, RepaymentMode } from '@/types/mortgage'

export function ExtraRepaymentsCard() {
  const { t } = useTranslation()
  const { mortgage, saveMortgage } = useMortgage()
  const [adding, setAdding] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newRecurring, setNewRecurring] = useState(false)
  const [newMode, setNewMode] = useState<RepaymentMode>('reduce_term')

  const impact = useMemo(
    () => (mortgage ? calculateMortgageImpact(mortgage) : null),
    [mortgage]
  )

  if (!mortgage) return null

  const extras = mortgage.extraRepayments ?? []

  const [addError, setAddError] = useState('')
  const [newEndDate, setNewEndDate] = useState('')

  const handleAdd = async () => {
    if (!newDate || !newAmount) return
    setAddError('')
    const amountVal = parseFloat(newAmount)
    if (isNaN(amountVal) || amountVal <= 0) {
      setAddError(t('mortgage.amountGreaterThanZero'))
      return
    }
    if (newDate < mortgage.startDate) {
      setAddError(t('mortgage.dateOnOrAfterStart'))
      return
    }
    if (newRecurring && newEndDate && newEndDate <= newDate) {
      setAddError(t('mortgage.endDateAfterStart'))
      return
    }
    const entry: ExtraRepayment = {
      id: crypto.randomUUID(),
      date: newDate,
      amount: Math.round(amountVal * 100),
      recurring: newRecurring,
      mode: newMode,
      ...(newRecurring && newEndDate ? { endDate: newEndDate } : {}),
    }
    const updated: MortgageConfig = {
      ...mortgage,
      extraRepayments: [...extras, entry].sort((a, b) => a.date.localeCompare(b.date)),
    }
    await saveMortgage(updated)
    setAdding(false)
    setNewDate('')
    setNewAmount('')
    setNewRecurring(false)
    setNewMode('reduce_term')
    setNewEndDate('')
    setAddError('')
  }

  const handleDelete = async (id: string) => {
    const updated: MortgageConfig = {
      ...mortgage,
      extraRepayments: extras.filter((e) => e.id !== id),
    }
    await saveMortgage(updated)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t('mortgage.extraRepayments')}</CardTitle>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('mortgage.addPayment')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Impact summary */}
        {impact && impact.interestSaved > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-md bg-green-50 border border-green-200">
            <TrendingDown className="h-5 w-5 text-green-600 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-green-800">
                {t('mortgage.saveInterest', { amount: formatCurrency(impact.interestSaved) })}
              </p>
              {impact.monthsSaved > 0 ? (
                <p className="text-green-600 text-xs">
                  {t('mortgage.payOffEarly', { months: impact.monthsSaved, newDate: format(new Date(impact.newPayoffDate + '-01'), 'MMM yyyy', { locale: getDateLocale() }), oldDate: format(new Date(impact.originalPayoffDate + '-01'), 'MMM yyyy', { locale: getDateLocale() }) })}
                </p>
              ) : (
                <p className="text-green-600 text-xs">
                  {t('mortgage.samePayoffLowerPayments')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Extra payments list */}
        {extras.map((extra) => (
          <div key={extra.id} className="flex items-center gap-3 p-2 rounded-md border">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{formatCurrency(extra.amount)}</span>
                <Badge variant={extra.recurring ? 'default' : 'outline'} className="text-xs">
                  {extra.recurring ? t('mortgage.monthly') : t('mortgage.oneTime')}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {(extra.mode ?? 'reduce_term') === 'reduce_term' ? t('mortgage.reduceTerm') : t('mortgage.reducePayment')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {extra.recurring ? t('common.from') : t('common.on')} {format(new Date(extra.date), 'MMM yyyy', { locale: getDateLocale() })}
                {extra.endDate && ` ${t('mortgage.until', { date: format(new Date(extra.endDate), 'MMM yyyy', { locale: getDateLocale() }) })}`}
              </p>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(extra.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}

        {/* Add form */}
        {adding && (
          <div className="p-3 rounded-md border border-dashed space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('common.date')}</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="sm:h-8 sm:text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('common.amount')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="5000"
                  min="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="sm:h-8 sm:text-sm"
                />
              </div>
            </div>
            {/* Mode: reduce term or reduce payment */}
            <div className="space-y-1">
              <Label className="text-xs">Effect</Label>
              <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setNewMode('reduce_term')}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
                    newMode === 'reduce_term' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {t('mortgage.reduceTerm')}
                </button>
                <button
                  type="button"
                  onClick={() => setNewMode('reduce_payment')}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
                    newMode === 'reduce_payment' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {t('mortgage.reducePayment')}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {newMode === 'reduce_term'
                  ? t('mortgage.keepSamePayment')
                  : t('mortgage.keepSameEndDate')}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={newRecurring}
                onChange={(e) => setNewRecurring(e.target.checked)}
                className="rounded"
              />
              {t('mortgage.recurringMonthly')}
            </label>
            {newRecurring && (
              <div className="space-y-1">
                <Label className="text-xs">{t('mortgage.endDateOptional')}</Label>
                <Input
                  type="date"
                  value={newEndDate}
                  min={newDate || undefined}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="sm:h-8 sm:text-sm"
                  placeholder={t('mortgage.endDateEmpty')}
                />
              </div>
            )}
            {addError && <p className="text-xs text-destructive">{addError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={!newDate || !newAmount}>{t('common.add')}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setAddError('') }}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}

        {extras.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {t('mortgage.noExtraPayments')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
