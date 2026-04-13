import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { getMortgageStats, calculateMortgageImpact } from '@/lib/mortgage-utils'
import type { MortgageConfig } from '@/types/mortgage'

interface MortgageOverviewCardProps {
  config: MortgageConfig
}

export function MortgageOverviewCard({ config }: MortgageOverviewCardProps) {
  const stats = useMemo(() => getMortgageStats(config), [config])
  const impact = useMemo(() => calculateMortgageImpact(config), [config])

  const details = [
    { label: 'Loan Amount', value: formatCurrency(config.principal) },
    { label: 'Term', value: `${config.termYears} years` },
    { label: 'Start', value: format(new Date(config.startDate), 'MMM yyyy') },
    { label: 'Payoff', value: format(new Date(stats.payoffDate + '-01'), 'MMM yyyy') },
    { label: 'Total Interest', value: formatCurrency(stats.totalInterest) },
    { label: 'Total Cost (P+I)', value: formatCurrency(stats.totalPayments) },
  ]

  if (config.propertyValue) {
    details.push(
      { label: 'Property Value', value: formatCurrency(config.propertyValue) },
      { label: 'LTV', value: `${((stats.remainingBalance / config.propertyValue) * 100).toFixed(1)}%` },
      { label: 'Equity', value: formatCurrency(config.propertyValue - stats.remainingBalance) },
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground font-medium">Mortgage Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {details.map((d) => (
            <div key={d.label}>
              <p className="text-xs text-muted-foreground">{d.label}</p>
              <p className="text-sm font-medium">{d.value}</p>
            </div>
          ))}
        </div>

        {/* Savings from extra repayments */}
        {impact && impact.interestSaved > 0 && (
          <div className="flex gap-4 p-3 rounded-lg bg-green-50 border border-green-200">
            <div>
              <p className="text-xs text-green-700">Interest Saved</p>
              <p className="text-sm font-bold text-green-700">{formatCurrency(impact.interestSaved)}</p>
            </div>
            {impact.monthsSaved > 0 ? (
              <>
                <div>
                  <p className="text-xs text-green-700">Time Saved</p>
                  <p className="text-sm font-bold text-green-700">{impact.monthsSaved} months</p>
                </div>
                <div>
                  <p className="text-xs text-green-700">New Payoff</p>
                  <p className="text-sm font-bold text-green-700">{format(new Date(impact.newPayoffDate + '-01'), 'MMM yyyy')}</p>
                </div>
              </>
            ) : (
              <div>
                <p className="text-xs text-green-700">Payoff Date</p>
                <p className="text-sm font-bold text-green-700">Unchanged, lower payments</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
