import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMortgage } from '@/context/MortgageContext'
import { generateAmortizationSchedule } from '@/lib/mortgage-utils'
import { formatCurrency, cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ShieldCheck, Plus, Edit2, Trash2 } from 'lucide-react'
import type { MortgageConfig, BalanceCorrection } from '@/types/mortgage'

export function BalanceCorrectionCard() {
  const { mortgage, saveMortgage } = useMortgage()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [corrDate, setCorrDate] = useState('')
  const [corrBalance, setCorrBalance] = useState('')
  const [corrKeepPayment, setCorrKeepPayment] = useState(false)
  const [error, setError] = useState('')

  // Generate schedule WITHOUT corrections to show calculated balance for comparison
  const uncorrectedSchedule = useMemo(() => {
    if (!mortgage) return []
    const configWithoutCorrections = { ...mortgage, balanceCorrections: undefined }
    return generateAmortizationSchedule(configWithoutCorrections)
  }, [mortgage])

  if (!mortgage) return null

  const corrections = mortgage.balanceCorrections ?? []
  const today = format(new Date(), 'yyyy-MM-dd')

  const getCalculatedBalance = (dateStr: string): number | null => {
    const month = dateStr.substring(0, 7)
    const row = uncorrectedSchedule.find((r) => r.date === month)
    return row ? row.remainingBalance : null
  }

  const resetForm = () => {
    setCorrDate(today)
    setCorrBalance('')
    setCorrKeepPayment(false)
    setError('')
  }

  const startAdding = () => {
    resetForm()
    setAdding(true)
  }

  const startEditing = (c: BalanceCorrection) => {
    setEditingId(c.id)
    setCorrDate(c.date)
    setCorrBalance(String(c.balance / 100))
    setCorrKeepPayment(c.keepCurrentPayment)
    setError('')
  }

  const validate = (): boolean => {
    setError('')
    if (!corrDate) { setError('Date is required'); return false }
    if (corrDate > today) { setError('Date cannot be in the future'); return false }
    if (corrDate < mortgage.startDate) { setError('Date must be after mortgage start'); return false }
    const bal = parseFloat(corrBalance)
    if (isNaN(bal) || bal < 0) { setError('Balance must be a positive number'); return false }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return
    const entry: BalanceCorrection = {
      id: editingId ?? crypto.randomUUID(),
      date: corrDate,
      balance: Math.round(parseFloat(corrBalance) * 100),
      keepCurrentPayment: corrKeepPayment,
    }

    let updated: BalanceCorrection[]
    if (editingId) {
      updated = corrections.map((c) => c.id === editingId ? entry : c)
    } else {
      updated = [...corrections, entry]
    }
    updated.sort((a, b) => a.date.localeCompare(b.date))

    await saveMortgage({ ...mortgage, balanceCorrections: updated })
    setAdding(false)
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    const updated = corrections.filter((c) => c.id !== id)
    await saveMortgage({
      ...mortgage,
      ...(updated.length > 0 ? { balanceCorrections: updated } : {}),
    } as MortgageConfig)
  }

  const calculatedForDate = corrDate ? getCalculatedBalance(corrDate) : null

  const formContent = (
    <div className="space-y-3 p-3 rounded-md border border-dashed">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Date (from bank statement)</Label>
          <Input
            type="date"
            value={corrDate}
            max={today}
            min={mortgage.startDate}
            onChange={(e) => setCorrDate(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Actual remaining balance</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="142350.00"
            value={corrBalance}
            onChange={(e) => setCorrBalance(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Show comparison with calculated balance */}
      {calculatedForDate !== null && corrDate && (
        <div className="text-xs p-2 rounded bg-muted">
          <span className="text-muted-foreground">App calculates: </span>
          <span className="font-medium">{formatCurrency(calculatedForDate)}</span>
          {corrBalance && (
            <>
              <span className="text-muted-foreground"> — Difference: </span>
              <span className={cn('font-medium', Math.round(parseFloat(corrBalance) * 100) - calculatedForDate > 0 ? 'text-destructive' : 'text-green-600')}>
                {formatCurrency(Math.abs(Math.round(parseFloat(corrBalance) * 100) - calculatedForDate))}
              </span>
            </>
          )}
        </div>
      )}

      {/* Keep payment or recalculate */}
      <div className="space-y-1">
        <Label className="text-xs">After correction</Label>
        <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setCorrKeepPayment(false)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
              !corrKeepPayment ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
            )}
          >
            Recalculate payment
          </button>
          <button
            type="button"
            onClick={() => setCorrKeepPayment(true)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
              corrKeepPayment ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
            )}
          >
            Keep current payment
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {corrKeepPayment
            ? 'Monthly payment stays the same — the term may change.'
            : 'Monthly payment is recalculated for the corrected balance.'}
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setEditingId(null) }}>Cancel</Button>
      </div>
    </div>
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Balance Corrections
        </CardTitle>
        {!adding && !editingId && (
          <Button size="sm" variant="outline" onClick={startAdding}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Correction
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Existing corrections */}
        {corrections.map((c) => (
          editingId === c.id ? (
            <div key={c.id}>{formContent}</div>
          ) : (
            <div key={c.id} className="flex items-center gap-3 p-2 rounded-md border">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatCurrency(c.balance)}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.keepCurrentPayment ? '(kept payment)' : '(recalculated)'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  As of {format(new Date(c.date), 'MMM d, yyyy')}
                </p>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEditing(c)}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          )
        ))}

        {/* Add form */}
        {adding && formContent}

        {corrections.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground text-center py-2">
            If the calculated balance doesn't match your bank statement, add a correction here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
