import { useMemo } from 'react'
import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useMortgage } from '@/context/MortgageContext'
import { getMortgageStats } from '@/lib/mortgage-utils'
import { formatCurrency } from '@/lib/utils'
import { Landmark, ArrowRight } from 'lucide-react'

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

  return (
    <Link to="/mortgage">
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            <span>Mortgage</span>
            {mortgage.variableRate && (
              <span className="text-xs font-normal text-muted-foreground">
                {mortgage.annualRate}% variable
              </span>
            )}
            <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Monthly payment</span>
            <span className="font-semibold">{formatCurrency(mortgage.monthlyPayment)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Principal: {formatCurrency(stats.currentMonthPrincipal)}</span>
            <span>Interest: {formatCurrency(stats.currentMonthInterest)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[#2a9d90]"
              style={{ width: `${Math.max(1, stats.progressPercent)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.progressPercent.toFixed(1)}% paid off &middot; {formatCurrency(stats.remainingBalance)} remaining
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
