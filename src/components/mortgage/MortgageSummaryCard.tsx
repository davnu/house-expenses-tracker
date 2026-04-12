import { useMemo } from 'react'
import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress-ring'
import { useMortgage } from '@/context/MortgageContext'
import { getMortgageStats } from '@/lib/mortgage-utils'
import { formatCurrency } from '@/lib/utils'
import { Landmark, ArrowRight, Calendar, TrendingDown, Percent, Clock } from 'lucide-react'
import { format } from 'date-fns'

export function MortgageSummaryCard() {
  const { mortgage, loading } = useMortgage()

  const stats = useMemo(
    () => (mortgage ? getMortgageStats(mortgage) : null),
    [mortgage]
  )

  if (loading) return null

  if (!mortgage || !stats) {
    return (
      <Link to="/mortgage">
        <Card className="border-dashed hover:bg-accent/50 transition-colors cursor-pointer">
          <CardContent className="p-4 flex items-center gap-3">
            <Landmark className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">Set up your mortgage</p>
              <p className="text-xs text-muted-foreground">Track payments, interest, and progress</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    )
  }

  const payoffFormatted = (() => {
    try {
      return format(new Date(stats.payoffDate + '-01'), 'MMM yyyy')
    } catch {
      return stats.payoffDate
    }
  })()

  const yearsRemaining = Math.floor(stats.monthsRemaining / 12)
  const monthsRemainder = stats.monthsRemaining % 12
  const timeLeft = yearsRemaining > 0
    ? `${yearsRemaining}y ${monthsRemainder}m`
    : `${monthsRemainder}m`

  return (
    <Link to="/mortgage">
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            <span>Mortgage</span>
            <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {/* Progress ring */}
            <div className="relative shrink-0">
              <ProgressRing percent={stats.progressPercent} size={100} strokeWidth={7} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold">{stats.progressPercent.toFixed(1)}%</span>
                <span className="text-[10px] text-muted-foreground">paid off</span>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 flex-1 min-w-0">
              <div className="flex items-start gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-sm font-semibold">{timeLeft}</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Payoff</p>
                  <p className="text-sm font-semibold">{payoffFormatted}</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="text-sm font-semibold">{formatCurrency(stats.remainingBalance)}</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Percent className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Rate</p>
                  <p className="text-sm font-semibold">{mortgage.annualRate}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Equity bar (if property value is set) */}
          {mortgage.propertyValue && mortgage.propertyValue > 0 && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Equity: {formatCurrency(mortgage.propertyValue - stats.remainingBalance)}</span>
                <span>LTV: {((stats.remainingBalance / mortgage.propertyValue) * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
                <div
                  className="h-full rounded-full bg-[#2a9d90]"
                  style={{ width: `${Math.max(1, ((mortgage.propertyValue - stats.remainingBalance) / mortgage.propertyValue) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
