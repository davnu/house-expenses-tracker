import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, getDateLocale } from '@/lib/utils'
import { calculateMonthlyPayment } from '@/lib/mortgage-utils'
import { format } from 'date-fns'
import type { ComparisonScenario, MortgageConfig, AmortizationType, ExtraRepayment, RepaymentMode } from '@/types/mortgage'

interface ComparisonFormProps {
  scenario: ComparisonScenario
  onChange: (scenario: ComparisonScenario) => void
  onReset: () => void
  startDate: string
  currentConfig: MortgageConfig
}

export function ComparisonForm({ scenario, onChange, onReset, startDate, currentConfig }: ComparisonFormProps) {
  const { t } = useTranslation()

  // String-based inputs so users can clear and retype without freezing
  const [principalStr, setPrincipalStr] = useState(() => (scenario.principal / 100).toFixed(0))
  const [rateStr, setRateStr] = useState(() => String(scenario.annualRate))
  const [termStr, setTermStr] = useState(() => String(scenario.termYears))

  // Sync string state when scenario changes externally (e.g. reset)
  useEffect(() => {
    setPrincipalStr((scenario.principal / 100).toFixed(0))
    setRateStr(String(scenario.annualRate))
    setTermStr(String(scenario.termYears))
  }, [scenario.principal, scenario.annualRate, scenario.termYears])

  const scenarioPayment = calculateMonthlyPayment(
    scenario.principal,
    scenario.annualRate,
    scenario.termYears * 12
  )

  const isItalian = scenario.amortizationType === 'italian'

  // Change detection against current mortgage
  const currentAmort = currentConfig.amortizationType ?? 'french'
  const isChanged = {
    principal: scenario.principal !== currentConfig.principal,
    rate: scenario.annualRate !== currentConfig.annualRate,
    term: scenario.termYears !== currentConfig.termYears,
    amort: scenario.amortizationType !== currentAmort,
  }
  const changedRing = 'ring-2 ring-blue-300'

  // Inline add form state for extra repayments
  const [adding, setAdding] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newRecurring, setNewRecurring] = useState(false)
  const [newEndDate, setNewEndDate] = useState('')
  const [newMode, setNewMode] = useState<RepaymentMode>('reduce_term')
  const [addError, setAddError] = useState('')

  const handleAdd = () => {
    if (!newDate || !newAmount) return
    setAddError('')
    const amountVal = parseFloat(newAmount)
    if (isNaN(amountVal) || amountVal <= 0) {
      setAddError(t('mortgage.amountGreaterThanZero'))
      return
    }
    if (newDate < startDate) {
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
    onChange({
      ...scenario,
      extraRepayments: [...scenario.extraRepayments, entry].sort((a, b) => a.date.localeCompare(b.date)),
    })
    setAdding(false)
    setNewDate('')
    setNewAmount('')
    setNewRecurring(false)
    setNewEndDate('')
    setNewMode('reduce_term')
    setAddError('')
  }

  const handleDelete = (id: string) => {
    onChange({
      ...scenario,
      extraRepayments: scenario.extraRepayments.filter((e) => e.id !== id),
    })
  }

  const handlePrincipalChange = (value: string) => {
    setPrincipalStr(value)
    const val = parseFloat(value)
    if (!isNaN(val) && val >= 0) {
      onChange({ ...scenario, principal: Math.round(val * 100) })
    }
  }

  const handleRateChange = (value: string) => {
    setRateStr(value)
    const val = parseFloat(value)
    if (!isNaN(val) && val >= 0 && val <= 50) {
      onChange({ ...scenario, annualRate: val })
    }
  }

  const handleTermChange = (value: string) => {
    setTermStr(value)
    const val = parseInt(value, 10)
    if (!isNaN(val) && val >= 1 && val <= 50) {
      onChange({ ...scenario, termYears: val })
    }
  }

  return (
    <div className="space-y-4">
      {/* Mortgage parameters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="comp-principal">{t('mortgage.loanAmount')}</Label>
          <Input
            id="comp-principal"
            type="number"
            min={0}
            step={1000}
            value={principalStr}
            onChange={(e) => handlePrincipalChange(e.target.value)}
            className={isChanged.principal ? changedRing : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comp-rate">{t('mortgage.annualRate')}</Label>
          <Input
            id="comp-rate"
            type="number"
            min={0}
            max={50}
            step={0.1}
            value={rateStr}
            onChange={(e) => handleRateChange(e.target.value)}
            className={isChanged.rate ? changedRing : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comp-term">{t('mortgage.termYears')}</Label>
          <Input
            id="comp-term"
            type="number"
            min={1}
            max={50}
            step={1}
            value={termStr}
            onChange={(e) => handleTermChange(e.target.value)}
            className={isChanged.term ? changedRing : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comp-amort">{t('mortgage.installmentType')}</Label>
          <Select
            id="comp-amort"
            value={scenario.amortizationType}
            onChange={(e) => onChange({ ...scenario, amortizationType: e.target.value as AmortizationType })}
            className={isChanged.amort ? changedRing : undefined}
          >
            <option value="french">{t('mortgage.fixedInstallment')}</option>
            <option value="italian">{t('mortgage.decreasingInstallment')}</option>
          </Select>
        </div>
      </div>

      {/* Extra repayments */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('mortgage.extraRepayments')}</p>
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('mortgage.addPayment')}
            </Button>
          )}
        </div>

        {/* List */}
        {scenario.extraRepayments.map((extra) => (
          <div key={extra.id} className="flex items-center gap-3 p-2 rounded-md border">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{formatCurrency(extra.amount)}</span>
                <Badge variant={extra.recurring ? 'default' : 'outline'} className="text-xs">
                  {extra.recurring ? t('mortgage.monthly') : t('mortgage.oneTime')}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {extra.mode === 'reduce_term' ? t('mortgage.reduceTerm') : t('mortgage.reducePayment')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {extra.recurring ? t('common.from') : t('common.on')}{' '}
                {format(new Date(extra.date), 'MMM yyyy', { locale: getDateLocale() })}
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
            <div className="space-y-1">
              <Label className="text-xs">{t('mortgage.compare.extraEffect')}</Label>
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
                {newMode === 'reduce_term' ? t('mortgage.keepSamePayment') : t('mortgage.keepSameEndDate')}
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
      </div>

      {/* Computed monthly payment + reset */}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="text-muted-foreground">
            {isItalian ? t('mortgage.firstPayment') : t('mortgage.monthlyPayment')}:
          </span>{' '}
          <span className="font-semibold">{formatCurrency(scenarioPayment)}</span>
          {isItalian && (
            <span className="text-xs text-muted-foreground ml-1">({t('mortgage.decreasesMonthly')})</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          {t('mortgage.compare.reset')}
        </Button>
      </div>
    </div>
  )
}
