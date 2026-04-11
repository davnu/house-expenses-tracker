import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EXPENSE_CATEGORIES, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import type { Expense } from '@/types/expense'

interface CategoryBreakdownProps {
  expenses: Expense[]
  title?: string
}

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius - 2}
      outerRadius={outerRadius + 4}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  )
}

export function CategoryBreakdown({ expenses, title = 'By Category' }: CategoryBreakdownProps) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)

  const { data, total } = useMemo(() => {
    const byCat: Record<string, number> = {}
    for (const e of expenses) {
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
    }
    const total = Object.values(byCat).reduce((s, v) => s + v, 0)
    const data = Object.entries(byCat)
      .map(([cat, amount]) => ({
        name: categoryLabel(cat),
        category: cat,
        amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
        fill: CATEGORY_COLORS[cat] ?? '#6b7280',
      }))
      .sort((a, b) => b.amount - a.amount)
    return { data, total }
  }, [expenses])

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <div className="relative w-full" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={90}
                  dataKey="amount"
                  activeShape={renderActiveShape}
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(undefined)}
                  strokeWidth={2}
                  stroke="var(--color-card)"
                  {...(activeIndex !== undefined ? { activeIndex } : {})}
                >
                  {data.map((entry) => (
                    <Cell key={entry.category} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-lg font-bold">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Legend */}
          <div className="w-full space-y-1.5 mt-2">
            {data.map((d, i) => (
              <div
                key={d.category}
                className="flex items-center justify-between text-sm cursor-default rounded px-1 py-0.5 transition-colors"
                style={{ backgroundColor: activeIndex === i ? `${d.fill}10` : undefined }}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(undefined)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                  <span className="truncate">{d.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium">{formatCurrency(d.amount)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{d.percent.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
