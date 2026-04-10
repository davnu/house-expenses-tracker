import { useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { ArrowDown, Download } from 'lucide-react'
import type { AmortizationRow } from '@/types/mortgage'

interface AmortizationTableProps {
  schedule: AmortizationRow[]
  currentMonth: number
  showRateColumn?: boolean
}

export function AmortizationTable({ schedule, currentMonth, showRateColumn }: AmortizationTableProps) {
  const currentRowRef = useRef<HTMLTableRowElement>(null)

  const scrollToCurrent = useCallback(() => {
    currentRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const exportCSV = useCallback(() => {
    const headers = ['Month', 'Date', 'Payment', 'Principal', 'Interest', 'Extra', 'Rate', 'Balance']
    const rows = schedule.map((r) => [
      r.month,
      format(new Date(r.date + '-01'), 'MMM yyyy'),
      (r.payment / 100).toFixed(2),
      (r.principalPortion / 100).toFixed(2),
      (r.interestPortion / 100).toFixed(2),
      r.extraPayment ? (r.extraPayment / 100).toFixed(2) : '',
      r.rateApplied + '%',
      (r.remainingBalance / 100).toFixed(2),
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `amortization-schedule.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [schedule])

  if (schedule.length === 0) return null

  const hasExtras = schedule.some((r) => r.extraPayment)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Amortization Schedule</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
          {currentMonth > 0 && (
            <Button size="sm" variant="outline" onClick={scrollToCurrent}>
              <ArrowDown className="h-3 w-3 mr-1" />
              Current month
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b">
              <tr className="text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">#</th>
                <th className="text-left py-2 px-3 font-medium">Date</th>
                {showRateColumn && <th className="text-right py-2 px-3 font-medium">Rate</th>}
                <th className="text-right py-2 px-3 font-medium">Payment</th>
                <th className="text-right py-2 px-3 font-medium">Principal</th>
                <th className="text-right py-2 px-3 font-medium">Interest</th>
                {hasExtras && <th className="text-right py-2 px-3 font-medium">Extra</th>}
                <th className="text-right py-2 px-3 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => {
                const isCurrent = row.month === currentMonth
                return (
                  <tr
                    key={row.month}
                    ref={isCurrent ? currentRowRef : undefined}
                    className={
                      isCurrent
                        ? 'bg-primary/10 font-medium border-l-2 border-l-primary'
                        : row.isRateChange
                          ? 'bg-amber-50 border-l-2 border-l-amber-400'
                          : 'border-b last:border-0 hover:bg-muted/50'
                    }
                  >
                    <td className="py-1.5 px-3 text-muted-foreground">{row.month}</td>
                    <td className="py-1.5 px-3">{format(new Date(row.date + '-01'), 'MMM yyyy')}</td>
                    {showRateColumn && (
                      <td className="py-1.5 px-3 text-right">
                        {row.isRateChange ? (
                          <span className="font-medium text-amber-600">{row.rateApplied}%</span>
                        ) : (
                          <span className="text-muted-foreground">{row.rateApplied}%</span>
                        )}
                      </td>
                    )}
                    <td className="py-1.5 px-3 text-right">{formatCurrency(row.payment)}</td>
                    <td className="py-1.5 px-3 text-right text-green-600">{formatCurrency(row.principalPortion)}</td>
                    <td className="py-1.5 px-3 text-right text-orange-600">{formatCurrency(row.interestPortion)}</td>
                    {hasExtras && (
                      <td className="py-1.5 px-3 text-right">
                        {row.extraPayment ? (
                          <span className="text-blue-600 font-medium">{formatCurrency(row.extraPayment)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-1.5 px-3 text-right">{formatCurrency(row.remainingBalance)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
