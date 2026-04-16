import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useIsMobile } from '@/hooks/use-mobile'
import { getDateLocale, getCurrencySymbol } from '@/lib/utils'
import { format } from 'date-fns'
import type { AmortizationRow } from '@/types/mortgage'

export function PaymentTooltip({ active, payload, label }: { active?: boolean; payload?: Payload<number, string>[]; label?: string }) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null

  const principal = payload.find((p: Payload<number, string>) => p.dataKey === 'principal')?.value ?? 0
  const interest = payload.find((p: Payload<number, string>) => p.dataKey === 'interest')?.value ?? 0
  const total = principal + interest
  const sym = getCurrencySymbol()
  const dateStr = label ? format(new Date(label + '-01'), 'MMM yyyy', { locale: getDateLocale() }) : ''

  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs">
      <p className="font-medium mb-1.5">{dateStr}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2a9d90]" />
            {t('mortgage.principal')}
          </span>
          <span className="tabular-nums">{sym}{Number(principal).toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#e76e50]" />
            {t('mortgage.interest')}
          </span>
          <span className="tabular-nums">{sym}{Number(interest).toLocaleString()}</span>
        </div>
        <div className="border-t pt-1 flex items-center justify-between gap-4 font-medium">
          <span>{t('mortgage.payment')}</span>
          <span className="tabular-nums">{sym}{Number(total).toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

interface PaymentBreakdownChartProps {
  schedule: AmortizationRow[]
  currentMonth: number
}

export function PaymentBreakdownChart({ schedule, currentMonth }: PaymentBreakdownChartProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const data = useMemo(() => {
    // Sample every 3 months, but always include rate change months and extra payment months
    return schedule
      .filter((row, i) => i % 3 === 0 || i === schedule.length - 1 || row.isRateChange || row.extraPayment)
      .map((row) => ({
        date: row.date,
        principal: Math.round(row.principalPortion / 100),
        interest: Math.round(row.interestPortion / 100),
      }))
  }, [schedule])

  const currentDate = currentMonth > 0 && currentMonth <= schedule.length
    ? schedule[currentMonth - 1]?.date
    : undefined

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('mortgage.paymentBreakdownOverTime')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${getCurrencySymbol()}${v}`} />
            <Tooltip content={<PaymentTooltip />} />
            <Legend formatter={(value) => value === 'principal' ? t('mortgage.principal') : t('mortgage.interest')} />
            <Area
              type="monotone"
              dataKey="interest"
              stackId="1"
              stroke="#e76e50"
              fill="#e76e50"
              fillOpacity={0.4}
            />
            <Area
              type="monotone"
              dataKey="principal"
              stackId="1"
              stroke="#2a9d90"
              fill="#2a9d90"
              fillOpacity={0.6}
            />
            {currentDate && (
              <ReferenceLine
                x={currentDate}
                stroke="#171717"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{ value: t('mortgage.nowMarker'), position: 'top', fill: '#171717', fontSize: 12 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
