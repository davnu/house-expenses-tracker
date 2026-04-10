import { useState } from 'react'
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useMortgage } from '@/context/MortgageContext'
import { REFERENCE_RATES, computeEffectiveRate } from '@/lib/mortgage-country'
import { format } from 'date-fns'
import type { MortgageConfig, RatePeriod, RateType } from '@/types/mortgage'

export function RatePeriodsCard() {
  const { mortgage, saveMortgage } = useMortgage()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editRate, setEditRate] = useState('')
  const [editRefRate, setEditRefRate] = useState('')
  const [editSpread, setEditSpread] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newRate, setNewRate] = useState('')
  const [newRefRate, setNewRefRate] = useState('')
  const [newSpread, setNewSpread] = useState('')
  const [newType, setNewType] = useState<RateType>('variable')
  const [addError, setAddError] = useState('')

  if (!mortgage) return null

  const periods = [...(mortgage.ratePeriods ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const vr = mortgage.variableRate
  const mr = mortgage.mixedRate
  const hasVariableConfig = !!(vr || mr)
  const refRateLabel = vr
    ? REFERENCE_RATES[vr.referenceRateId]?.label ?? vr.referenceRateId
    : mr ? REFERENCE_RATES[mr.referenceRateId]?.label ?? mr.referenceRateId : null
  const activeSpread = vr?.spread ?? mr?.spread

  const startAdding = () => {
    setAdding(true)
    if (activeSpread !== undefined) {
      setNewSpread(String(activeSpread))
      setNewRefRate('')
    }
    setNewRate('')
    setNewDate('')
    setNewType('variable')
    setAddError('')
  }

  const startEditing = (period: RatePeriod) => {
    setEditingId(period.id)
    setEditDate(period.startDate)
    if (hasVariableConfig && period.referenceRate !== undefined) {
      setEditRefRate(String(period.referenceRate))
      setEditSpread(String(period.spread ?? activeSpread ?? 0))
    } else {
      setEditRate(String(period.annualRate))
    }
  }

  const saveEdit = async () => {
    if (!editingId) return
    const period = periods.find((p) => p.id === editingId)
    if (!period) return

    let updatedPeriod: RatePeriod
    if (hasVariableConfig && editRefRate) {
      const ref = parseFloat(editRefRate)
      const sp = parseFloat(editSpread)
      const effective = computeEffectiveRate(ref, sp, { rateFloor: vr?.rateFloor ?? mr?.rateFloor })
      updatedPeriod = { ...period, startDate: editDate, annualRate: effective, referenceRate: ref, spread: sp }
    } else {
      updatedPeriod = { ...period, startDate: editDate, annualRate: parseFloat(editRate) }
    }

    const updated: MortgageConfig = {
      ...mortgage,
      ratePeriods: periods.map((p) => p.id === editingId ? updatedPeriod : p),
    }
    await saveMortgage(updated)
    setEditingId(null)
  }

  const handleAdd = async () => {
    if (!newDate) return
    setAddError('')

    let rateVal: number
    let refRate: number | undefined
    let spread: number | undefined

    if (hasVariableConfig && newRefRate) {
      refRate = parseFloat(newRefRate)
      spread = parseFloat(newSpread || String(activeSpread ?? 0))
      if (isNaN(refRate) || isNaN(spread)) {
        setAddError('Please enter valid numbers')
        return
      }
      rateVal = computeEffectiveRate(refRate, spread, { rateFloor: vr?.rateFloor ?? mr?.rateFloor })
    } else {
      rateVal = parseFloat(newRate)
      if (isNaN(rateVal) || rateVal <= 0 || rateVal >= 50) {
        setAddError('Rate must be between 0.01% and 50%')
        return
      }
    }

    if (newDate <= mortgage.startDate) {
      setAddError('Date must be after the mortgage start date')
      return
    }
    const newMonth = newDate.substring(0, 7)
    if (periods.some((p) => p.startDate.substring(0, 7) === newMonth)) {
      setAddError('A rate change already exists for this month')
      return
    }

    const period: RatePeriod = {
      id: crypto.randomUUID(),
      startDate: newDate,
      annualRate: rateVal,
      rateType: newType,
      ...(refRate !== undefined ? { referenceRate: refRate } : {}),
      ...(spread !== undefined ? { spread } : {}),
    }
    const updated: MortgageConfig = {
      ...mortgage,
      ratePeriods: [...periods, period].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    }
    await saveMortgage(updated)
    setAdding(false)
  }

  const handleDelete = async (id: string) => {
    const updated: MortgageConfig = {
      ...mortgage,
      ratePeriods: periods.filter((p) => p.id !== id),
    }
    await saveMortgage(updated)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Rate History</CardTitle>
        <div className="flex gap-2">
          {periods.length > 0 && !adding && (
            <Button size="sm" variant="ghost" className="text-muted-foreground text-xs" onClick={async () => {
              await saveMortgage({ ...mortgage, ratePeriods: [] })
            }}>
              Clear all
            </Button>
          )}
          {!adding && (
            <Button size="sm" variant="outline" onClick={startAdding}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Rate Change
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {/* Initial rate */}
        <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{mortgage.annualRate}%</span>
              <Badge variant="secondary" className="text-xs">{mortgage.rateType}</Badge>
              <Badge variant="outline" className="text-xs">Initial</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              From {format(new Date(mortgage.startDate), 'MMM yyyy')}
              {(vr || mr) && <span> ({refRateLabel} {(vr?.currentReferenceRate ?? mr?.currentReferenceRate)}% + {activeSpread}%)</span>}
            </p>
          </div>
        </div>

        {/* Rate periods */}
        {periods.map((period) => (
          <div key={period.id} className="flex items-center gap-3 p-2 rounded-md border">
            {editingId === period.id ? (
              <div className="flex-1 space-y-2">
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-7 text-xs" />
                {hasVariableConfig ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" step="0.01" value={editRefRate} onChange={(e) => setEditRefRate(e.target.value)} className="h-7 text-xs" placeholder="Ref rate" />
                    <Input type="number" step="0.01" value={editSpread} onChange={(e) => setEditSpread(e.target.value)} className="h-7 text-xs" placeholder="Spread" />
                  </div>
                ) : (
                  <Input type="number" step="0.01" value={editRate} onChange={(e) => setEditRate(e.target.value)} className="h-7 text-xs" placeholder="Rate %" />
                )}
                <div className="flex gap-1">
                  <Button size="sm" className="h-6 text-xs px-2" onClick={saveEdit}><Check className="h-3 w-3 mr-1" />Save</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{period.annualRate}%</span>
                    <Badge variant="secondary" className="text-xs">{period.rateType}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    From {format(new Date(period.startDate), 'MMM yyyy')}
                    {period.referenceRate !== undefined && period.spread !== undefined && (
                      <span> ({refRateLabel} {period.referenceRate}% + {period.spread}%)</span>
                    )}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEditing(period)}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(period.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ))}

        {periods.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {hasVariableConfig && new Date(mortgage.startDate) < new Date()
              ? 'Loading historical rates...'
              : 'No rate changes yet. Add one if your rate changes in the future.'}
          </p>
        )}
        </div>

        {/* Add form — outside scroll area */}
        {adding && (
          <div className="p-3 rounded-md border border-dashed space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-8 text-sm" />
            </div>

            {hasVariableConfig ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">New {refRateLabel} (%)</Label>
                    <Input type="number" step="0.01" placeholder="3.5" value={newRefRate} onChange={(e) => setNewRefRate(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Spread (%)</Label>
                    <Input type="number" step="0.01" value={newSpread} onChange={(e) => setNewSpread(e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
                {newRefRate && newSpread && (
                  <p className="text-sm font-medium p-2 rounded bg-background">
                    Effective rate: {newRefRate}% + {newSpread}% = {computeEffectiveRate(parseFloat(newRefRate), parseFloat(newSpread), { rateFloor: vr?.rateFloor ?? mr?.rateFloor })}%
                  </p>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Annual rate (%)</Label>
                  <Input type="number" step="0.01" placeholder="3.5" min="0.01" max="50" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
                    <button type="button" onClick={() => setNewType('fixed')} className={cn('flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all cursor-pointer', newType === 'fixed' ? 'bg-background shadow-sm' : 'text-muted-foreground')}>Fixed</button>
                    <button type="button" onClick={() => setNewType('variable')} className={cn('flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all cursor-pointer', newType === 'variable' ? 'bg-background shadow-sm' : 'text-muted-foreground')}>Variable</button>
                  </div>
                </div>
              </div>
            )}

            {addError && <p className="text-xs text-destructive">{addError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={!newDate || (!hasVariableConfig && !newRate) || (hasVariableConfig && !newRefRate)}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setAddError('') }}>Cancel</Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )
}
