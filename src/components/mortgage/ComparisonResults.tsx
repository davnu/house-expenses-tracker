import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { ArrowDown, ArrowUp, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatCurrency, getDateLocale, getCurrencySymbol } from '@/lib/utils'
import { format } from 'date-fns'
import type { ComparisonOutput } from '@/lib/mortgage-comparison'
import { PaymentTooltip } from './PaymentBreakdownChart'

interface ComparisonResultsProps {
  comparison: ComparisonOutput
  currentMonthIndex: number
}

function DiffIcon({ value }: { value: number }) {
  if (value > 0) return <ArrowUp className="h-3.5 w-3.5" />
  if (value < 0) return <ArrowDown className="h-3.5 w-3.5" />
  return <Minus className="h-3.5 w-3.5" />
}

function diffColor(value: number, lowerIsBetter: boolean) {
  if (value === 0) return 'text-muted-foreground'
  const isGood = lowerIsBetter ? value < 0 : value > 0
  return isGood ? 'text-green-700' : 'text-amber-700'
}

function diffBg(value: number, lowerIsBetter: boolean) {
  if (value === 0) return 'bg-muted/50'
  const isGood = lowerIsBetter ? value < 0 : value > 0
  return isGood ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
}

export function ComparisonResults({ comparison, currentMonthIndex }: ComparisonResultsProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { current, scenario, diff } = comparison

  return (
    <div className="space-y-5">
      {/* Headline difference cards */}
      <HeadlineCards current={current} scenario={scenario} diff={diff} />

      {/* Total savings/cost banner */}
      <TotalSavingsSummary diff={diff} />

      {/* Detail table */}
      <DetailTable current={current} scenario={scenario} diff={diff} />

      {/* Overlay balance chart */}
      <OverlayChart
        currentSchedule={current.schedule}
        scenarioSchedule={scenario.schedule}
        currentMonthIndex={currentMonthIndex}
        isMobile={isMobile}
      />

      {/* Side-by-side payment breakdown */}
      <PaymentBreakdownComparison
        currentSchedule={current.schedule}
        scenarioSchedule={scenario.schedule}
        currentMonthIndex={currentMonthIndex}
        isMobile={isMobile}
      />

      {/* Year-by-year milestone table */}
      <MilestoneTable
        currentSchedule={current.schedule}
        scenarioSchedule={scenario.schedule}
        isMobile={isMobile}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
// Headline Cards
// ─────────────────────────────────────────────

function formatMonths(totalMonths: number): string {
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (years > 0 && months > 0) return `${years}y ${months}m`
  if (years > 0) return `${years}y`
  return `${totalMonths}m`
}

function HeadlineCards({
  current, scenario, diff,
}: {
  current: ComparisonOutput['current']
  scenario: ComparisonOutput['scenario']
  diff: ComparisonOutput['diff']
}) {
  const { t } = useTranslation()

  const cards = [
    {
      label: t('mortgage.compare.monthlyDiff'),
      scenarioAbsolute: formatCurrency(scenario.monthlyPayment),
      currentAbsolute: formatCurrency(current.monthlyPayment),
      value: diff.monthlyPayment,
      formatDiff: (v: number) => formatCurrency(Math.abs(v)),
      suffix: (v: number) => v > 0 ? t('mortgage.compare.morePerMonth') : v < 0 ? t('mortgage.compare.lessPerMonth') : '',
      lowerIsBetter: true,
    },
    {
      label: t('mortgage.compare.interestDiff'),
      scenarioAbsolute: formatCurrency(scenario.totalInterest),
      currentAbsolute: formatCurrency(current.totalInterest),
      value: diff.totalInterest,
      formatDiff: (v: number) => formatCurrency(Math.abs(v)),
      suffix: (v: number) => v > 0 ? t('mortgage.compare.moreInterest') : v < 0 ? t('mortgage.compare.lessInterest') : '',
      lowerIsBetter: true,
    },
    {
      label: t('mortgage.compare.timeDiff'),
      scenarioAbsolute: formatMonths(scenario.totalMonths),
      currentAbsolute: formatMonths(current.totalMonths),
      value: diff.months,
      formatDiff: (v: number) => formatMonths(Math.abs(v)),
      suffix: (v: number) => v > 0 ? t('mortgage.compare.longerTerm') : v < 0 ? t('mortgage.compare.shorterTerm') : '',
      lowerIsBetter: true,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border p-3 ${diffBg(card.value, card.lowerIsBetter)}`}
        >
          <p className="text-xs text-muted-foreground mb-1.5">{card.label}</p>
          <div className="flex items-baseline gap-2">
            <div>
              <span className="text-lg font-bold tabular-nums">{card.scenarioAbsolute}</span>
              <p className="text-[10px] text-muted-foreground leading-tight">{t('mortgage.compare.scenario')}</p>
            </div>
            <span className="text-xs text-muted-foreground">{t('mortgage.compare.vs')}</span>
            <div>
              <span className="text-sm text-muted-foreground tabular-nums">{card.currentAbsolute}</span>
              <p className="text-[10px] text-muted-foreground leading-tight">{t('mortgage.compare.yourMortgage')}</p>
            </div>
          </div>
          {card.value !== 0 && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${diffColor(card.value, card.lowerIsBetter)}`}>
              <DiffIcon value={card.value} />
              <span>{card.formatDiff(card.value)} {card.suffix(card.value)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// Total Savings Summary
// ─────────────────────────────────────────────

function TotalSavingsSummary({ diff }: { diff: ComparisonOutput['diff'] }) {
  const { t } = useTranslation()

  // Suppress for negligible differences (< €1) caused by rounding
  if (Math.abs(diff.totalPayments) < 100) return null

  const saves = diff.totalPayments < 0
  const amount = formatCurrency(Math.abs(diff.totalPayments))

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      saves ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
    }`}>
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
        saves ? 'bg-green-100' : 'bg-amber-100'
      }`}>
        {saves
          ? <TrendingDown className="h-4 w-4 text-green-700" />
          : <TrendingUp className="h-4 w-4 text-amber-700" />
        }
      </div>
      <p className={`text-sm font-medium ${saves ? 'text-green-800' : 'text-amber-800'}`}>
        {saves
          ? t('mortgage.compare.savesOverall', { amount })
          : t('mortgage.compare.costsOverall', { amount })
        }
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// Detail Table
// ─────────────────────────────────────────────

function DetailTable({
  current, scenario, diff,
}: {
  current: ComparisonOutput['current']
  scenario: ComparisonOutput['scenario']
  diff: ComparisonOutput['diff']
}) {
  const { t } = useTranslation()

  const currentInterestShare = current.totalPayments > 0 ? Math.round((current.totalInterest / current.totalPayments) * 1000) / 10 : 0
  const scenarioInterestShare = scenario.totalPayments > 0 ? Math.round((scenario.totalInterest / scenario.totalPayments) * 1000) / 10 : 0
  const interestShareDiff = Math.round((scenarioInterestShare - currentInterestShare) * 10) / 10

  const rows = [
    {
      label: t('mortgage.monthlyPayment'),
      current: formatCurrency(current.monthlyPayment),
      scenario: formatCurrency(scenario.monthlyPayment),
      diff: diff.monthlyPayment,
      diffDisplay: formatCurrency(Math.abs(diff.monthlyPayment)),
      lowerIsBetter: true,
    },
    {
      label: t('mortgage.totalInterest'),
      current: formatCurrency(current.totalInterest),
      scenario: formatCurrency(scenario.totalInterest),
      diff: diff.totalInterest,
      diffDisplay: formatCurrency(Math.abs(diff.totalInterest)),
      lowerIsBetter: true,
    },
    {
      label: t('mortgage.compare.interestShare'),
      current: `${currentInterestShare}%`,
      scenario: `${scenarioInterestShare}%`,
      diff: interestShareDiff,
      diffDisplay: `${Math.abs(interestShareDiff)}%`,
      lowerIsBetter: true,
    },
    {
      label: t('mortgage.totalCostPI'),
      current: formatCurrency(current.totalPayments),
      scenario: formatCurrency(scenario.totalPayments),
      diff: diff.totalPayments,
      diffDisplay: formatCurrency(Math.abs(diff.totalPayments)),
      lowerIsBetter: true,
    },
    {
      label: t('mortgage.payoff'),
      current: format(new Date(current.payoffDate + '-01'), 'MMM yyyy', { locale: getDateLocale() }),
      scenario: format(new Date(scenario.payoffDate + '-01'), 'MMM yyyy', { locale: getDateLocale() }),
      diff: diff.months,
      diffDisplay: `${Math.abs(diff.months)}m`,
      lowerIsBetter: true,
    },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 text-muted-foreground font-medium"></th>
            <th className="text-right py-2 px-3 text-muted-foreground font-medium">{t('mortgage.compare.yourMortgage')}</th>
            <th className="text-right py-2 px-3 text-muted-foreground font-medium">{t('mortgage.compare.scenario')}</th>
            <th className="text-right py-2 pl-3 text-muted-foreground font-medium">{t('mortgage.compare.difference')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isWinner = row.lowerIsBetter ? row.diff < 0 : row.diff > 0
            return (
              <tr key={row.label} className="border-b last:border-0">
                <td className="py-2.5 pr-4 font-medium">{row.label}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{row.current}</td>
                <td className={`py-2.5 px-3 text-right tabular-nums ${isWinner ? 'bg-green-50 font-medium text-green-800 rounded' : ''}`}>
                  {row.scenario}
                </td>
                <td className={`py-2.5 pl-3 text-right tabular-nums ${diffColor(row.diff, row.lowerIsBetter)}`}>
                  <span className="flex items-center justify-end gap-1">
                    <DiffIcon value={row.diff} />
                    {row.diffDisplay}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────
// Overlay Chart
// ─────────────────────────────────────────────

function OverlayChart({
  currentSchedule,
  scenarioSchedule,
  currentMonthIndex,
  isMobile,
}: {
  currentSchedule: ComparisonOutput['current']['schedule']
  scenarioSchedule: ComparisonOutput['scenario']['schedule']
  currentMonthIndex: number
  isMobile: boolean
}) {
  const { t } = useTranslation()
  const sym = useMemo(() => getCurrencySymbol(), [])

  const data = useMemo(() => {
    const maxLength = Math.max(currentSchedule.length, scenarioSchedule.length)
    const currentMap = new Map(currentSchedule.map((r) => [r.date, r.remainingBalance]))
    const scenarioMap = new Map(scenarioSchedule.map((r) => [r.date, r.remainingBalance]))

    // Collect all unique dates
    const allDates = new Set<string>()
    currentSchedule.forEach((r) => allDates.add(r.date))
    scenarioSchedule.forEach((r) => allDates.add(r.date))
    const sortedDates = [...allDates].sort()

    // Sample every 6 months + first + last of each schedule
    const firstCurrent = currentSchedule[0]?.date
    const lastCurrent = currentSchedule[currentSchedule.length - 1]?.date
    const firstScenario = scenarioSchedule[0]?.date
    const lastScenario = scenarioSchedule[scenarioSchedule.length - 1]?.date

    return sortedDates
      .filter((date, i) => {
        return i % 6 === 0
          || date === firstCurrent || date === lastCurrent
          || date === firstScenario || date === lastScenario
          || i === sortedDates.length - 1
      })
      .map((date) => ({
        date,
        current: currentMap.has(date) ? Math.round((currentMap.get(date)!) / 100) : undefined,
        scenario: scenarioMap.has(date) ? Math.round((scenarioMap.get(date)!) / 100) : undefined,
      }))
  }, [currentSchedule, scenarioSchedule])

  const currentDate = currentMonthIndex > 0 && currentMonthIndex <= currentSchedule.length
    ? currentSchedule[currentMonthIndex - 1]?.date
    : undefined

  if (data.length === 0) return null

  return (
    <div>
      <p className="text-sm font-medium mb-3">{t('mortgage.compare.balanceComparison')}</p>
      <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${sym}${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${sym}${Number(value).toLocaleString()}`,
              name === 'current' ? t('mortgage.compare.yourMortgage') : t('mortgage.compare.scenario'),
            ]}
            labelFormatter={(label) => format(new Date(label + '-01'), 'MMM yyyy', { locale: getDateLocale() })}
          />
          <Legend
            formatter={(value) =>
              value === 'current' ? t('mortgage.compare.yourMortgage') : t('mortgage.compare.scenario')
            }
          />
          <Area
            type="monotone"
            dataKey="current"
            stroke="#2a9d90"
            fill="#2a9d90"
            fillOpacity={0.12}
            strokeWidth={2}
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="scenario"
            stroke="#264653"
            fill="#264653"
            fillOpacity={0.08}
            strokeWidth={2}
            strokeDasharray="6 3"
            connectNulls={false}
          />
          {currentDate && (
            <ReferenceLine
              x={currentDate}
              stroke="#e76e50"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{ value: t('mortgage.nowMarker'), position: 'top', fill: '#e76e50', fontSize: 12 }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─────────────────────────────────────────────
// Payment Breakdown Comparison (side-by-side)
// ─────────────────────────────────────────────

function PaymentBreakdownComparison({
  currentSchedule,
  scenarioSchedule,
  currentMonthIndex,
  isMobile,
}: {
  currentSchedule: ComparisonOutput['current']['schedule']
  scenarioSchedule: ComparisonOutput['scenario']['schedule']
  currentMonthIndex: number
  isMobile: boolean
}) {
  const { t } = useTranslation()
  const sym = useMemo(() => getCurrencySymbol(), [])

  const { currentData, scenarioData, yMax } = useMemo(() => {
    const sampleSchedule = (schedule: ComparisonOutput['current']['schedule']) =>
      schedule
        .filter((row, i) => i % 3 === 0 || i === schedule.length - 1 || row.isRateChange || row.extraPayment)
        .map((row) => ({
          date: row.date,
          principal: Math.round(row.principalPortion / 100),
          interest: Math.round(row.interestPortion / 100),
        }))

    const cd = sampleSchedule(currentSchedule)
    const sd = sampleSchedule(scenarioSchedule)

    // Shared Y-axis max for honest visual comparison
    const allPayments = [
      ...cd.map((d) => d.principal + d.interest),
      ...sd.map((d) => d.principal + d.interest),
    ]
    const max = Math.max(...allPayments, 0)
    // Add 10% headroom and round to nice number
    const headroom = Math.ceil(max * 1.1 / 100) * 100

    return { currentData: cd, scenarioData: sd, yMax: headroom }
  }, [currentSchedule, scenarioSchedule])

  const currentDate = currentMonthIndex > 0 && currentMonthIndex <= currentSchedule.length
    ? currentSchedule[currentMonthIndex - 1]?.date
    : undefined

  if (currentData.length === 0 && scenarioData.length === 0) return null

  const chartHeight = isMobile ? 200 : 260

  const renderChart = (
    data: typeof currentData,
    showNowLine: boolean,
    label: string,
  ) => (
    <div>
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis domain={[0, yMax]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${sym}${v}`} />
          <Tooltip content={<PaymentTooltip />} />
          <Area type="monotone" dataKey="interest" stackId="1" stroke="#e76e50" fill="#e76e50" fillOpacity={0.4} />
          <Area type="monotone" dataKey="principal" stackId="1" stroke="#2a9d90" fill="#2a9d90" fillOpacity={0.6} />
          {showNowLine && currentDate && (
            <ReferenceLine
              x={currentDate}
              stroke="#171717"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{ value: t('mortgage.nowMarker'), position: 'top', fill: '#171717', fontSize: 11 }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )

  return (
    <div>
      <p className="text-sm font-medium mb-3">{t('mortgage.compare.paymentBreakdown')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderChart(currentData, true, t('mortgage.compare.yourMortgage'))}
        {renderChart(scenarioData, false, t('mortgage.compare.scenario'))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Milestone Table (year-by-year)
// ─────────────────────────────────────────────

interface MilestoneRow {
  year: number
  date: string
  current: { payment: number; balance: number; interestPaid: number } | null
  scenario: { payment: number; balance: number; interestPaid: number } | null
  balanceDiff: number | null
}

function MilestoneTable({
  currentSchedule,
  scenarioSchedule,
  isMobile,
}: {
  currentSchedule: ComparisonOutput['current']['schedule']
  scenarioSchedule: ComparisonOutput['scenario']['schedule']
  isMobile: boolean
}) {
  const { t } = useTranslation()

  const rows = useMemo(() => {
    const maxLength = Math.max(currentSchedule.length, scenarioSchedule.length)
    const milestoneYears = [1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
      .filter((y) => y * 12 <= maxLength)

    // Pre-compute cumulative interest arrays for O(1) lookup per milestone
    const cumulativeInterestCurrent = currentSchedule.reduce<number[]>((acc, r, i) => {
      acc.push((acc[i - 1] ?? 0) + r.interestPortion)
      return acc
    }, [])
    const cumulativeInterestScenario = scenarioSchedule.reduce<number[]>((acc, r, i) => {
      acc.push((acc[i - 1] ?? 0) + r.interestPortion)
      return acc
    }, [])

    return milestoneYears.map((year): MilestoneRow => {
      const monthIndex = year * 12 - 1 // 0-based
      const cRow = monthIndex < currentSchedule.length ? currentSchedule[monthIndex] : null
      const sRow = monthIndex < scenarioSchedule.length ? scenarioSchedule[monthIndex] : null

      const current = cRow ? {
        payment: cRow.payment,
        balance: cRow.remainingBalance,
        interestPaid: cumulativeInterestCurrent[monthIndex] ?? 0,
      } : null
      const scenario = sRow ? {
        payment: sRow.payment,
        balance: sRow.remainingBalance,
        interestPaid: cumulativeInterestScenario[monthIndex] ?? 0,
      } : null
      const balanceDiff = current && scenario ? scenario.balance - current.balance : null

      // Use whichever schedule has the row for the date label
      const dateRow = cRow ?? sRow
      const date = dateRow
        ? format(new Date(dateRow.date + '-01'), 'MMM yyyy', { locale: getDateLocale() })
        : ''

      return { year, date, current, scenario, balanceDiff }
    })
  }, [currentSchedule, scenarioSchedule])

  if (rows.length === 0) return null

  const paidOffBadge = (
    <span className="text-xs text-green-700 font-medium">{t('mortgage.compare.paidOff')}</span>
  )

  if (isMobile) {
    return (
      <div>
        <p className="text-sm font-medium mb-3">{t('mortgage.compare.atAGlance')}</p>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.year} className="rounded-lg border p-3 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{t('mortgage.compare.year')} {row.year}</span>
                <span className="text-xs text-muted-foreground">{row.date}</span>
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('mortgage.compare.yourMortgage')}</span>
                  {row.current ? (
                    <span className="tabular-nums">
                      {formatCurrency(row.current.payment)}{t('mortgage.compare.perMonth')} · {formatCurrency(row.current.balance)}
                    </span>
                  ) : paidOffBadge}
                </div>
                {row.current && (
                  <div className="flex justify-end text-xs text-muted-foreground tabular-nums">
                    {t('mortgage.compare.interestPaid')}: {formatCurrency(row.current.interestPaid)}
                  </div>
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('mortgage.compare.scenario')}</span>
                  {row.scenario ? (
                    <span className="tabular-nums">
                      {formatCurrency(row.scenario.payment)}{t('mortgage.compare.perMonth')} · {formatCurrency(row.scenario.balance)}
                    </span>
                  ) : paidOffBadge}
                </div>
                {row.scenario && (
                  <div className="flex justify-end text-xs text-muted-foreground tabular-nums">
                    {t('mortgage.compare.interestPaid')}: {formatCurrency(row.scenario.interestPaid)}
                  </div>
                )}
              </div>
              {row.balanceDiff !== null && row.balanceDiff !== 0 && (
                <div className={`flex items-center justify-end gap-1 text-xs ${diffColor(row.balanceDiff, true)}`}>
                  <DiffIcon value={row.balanceDiff} />
                  {formatCurrency(Math.abs(row.balanceDiff))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm font-medium mb-3">{t('mortgage.compare.atAGlance')}</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b">
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">{t('mortgage.compare.year')}</th>
              <th colSpan={3} className="text-center py-2 px-3 text-muted-foreground font-medium border-l">{t('mortgage.compare.yourMortgage')}</th>
              <th colSpan={3} className="text-center py-2 px-3 text-muted-foreground font-medium border-l">{t('mortgage.compare.scenario')}</th>
              <th className="text-right py-2 px-3 text-muted-foreground font-medium border-l">{t('mortgage.compare.balanceDiff')}</th>
            </tr>
            <tr className="border-b text-xs text-muted-foreground">
              <th></th>
              <th className="text-right py-1 px-3 font-normal border-l">{t('mortgage.payment')}</th>
              <th className="text-right py-1 px-3 font-normal">{t('mortgage.balance')}</th>
              <th className="text-right py-1 px-3 font-normal">{t('mortgage.compare.interestPaid')}</th>
              <th className="text-right py-1 px-3 font-normal border-l">{t('mortgage.payment')}</th>
              <th className="text-right py-1 px-3 font-normal">{t('mortgage.balance')}</th>
              <th className="text-right py-1 px-3 font-normal">{t('mortgage.compare.interestPaid')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-2 px-3 font-medium">
                  {row.year}
                  <span className="text-xs text-muted-foreground ml-1.5">{row.date}</span>
                </td>
                {row.current ? (
                  <>
                    <td className="py-2 px-3 text-right tabular-nums border-l">{formatCurrency(row.current.payment)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(row.current.balance)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCurrency(row.current.interestPaid)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="py-2 px-3 text-center border-l">{paidOffBadge}</td>
                )}
                {row.scenario ? (
                  <>
                    <td className="py-2 px-3 text-right tabular-nums border-l">{formatCurrency(row.scenario.payment)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(row.scenario.balance)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCurrency(row.scenario.interestPaid)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="py-2 px-3 text-center border-l">{paidOffBadge}</td>
                )}
                <td className={`py-2 px-3 text-right tabular-nums border-l ${row.balanceDiff !== null && row.balanceDiff !== 0 ? diffColor(row.balanceDiff, true) : 'text-muted-foreground'}`}>
                  {row.balanceDiff !== null ? (
                    <span className="flex items-center justify-end gap-1">
                      {row.balanceDiff !== 0 && <DiffIcon value={row.balanceDiff} />}
                      {row.balanceDiff === 0 ? '—' : formatCurrency(Math.abs(row.balanceDiff))}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
