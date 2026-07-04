import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@/components/ui/primitives'
import {
  getOrdersPerHour,
  getTopProducts,
  getSalesDaily,
  getPaymentMix,
} from '@/lib/analyticsStore'
import { formatCurrency } from '@/lib/billing'

const CHART_W = 1100
const CHART_H = 220
const PAD = { top: 16, right: 12, bottom: 36, left: 36 }

export default function AdminAnalytics() {
  const [hourly, setHourly] = useState([])
  const [top, setTop] = useState([])
  const [daily, setDaily] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      const [h, t, d, p] = await Promise.all([
        getOrdersPerHour(),
        getTopProducts(8),
        getSalesDaily(7),
        getPaymentMix(7),
      ])
      setHourly(h.points ?? [])
      setTop(t)
      setDaily(d)
      setPayments(p)
    } catch {
      setLoadError('Could not load analytics from the server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // KPIs from the last 3 business days.
  const last3 = daily.slice(-3)
  const net3 = last3.reduce((s, d) => s + Number(d.net_sales || 0), 0)
  const orders3 = last3.reduce((s, d) => s + Number(d.orders_count || 0), 0)
  const topPizza = top[0]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>Live from the API · Asia/Kolkata</CardDescription>
          </div>
          <Button variant="outline" onClick={refresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent>
          {loadError && (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {loadError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Net sales · 3 days" value={formatCurrency(net3)} />
            <StatTile label="Orders · 3 days" value={orders3} />
            <StatTile
              label="Top pizza"
              value={topPizza?.name ?? '—'}
              sub={topPizza ? `${topPizza.units_sold} sold` : ''}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sales · last 3 days</CardTitle>
            <CardDescription>Net revenue per day</CardDescription>
          </CardHeader>
          <CardContent>
            {last3.length === 0 ? (
              <EmptyNote />
            ) : (
              <BarList
                items={last3.map((d) => ({
                  label: formatDay(d.business_date),
                  value: Number(d.net_sales || 0),
                  valueLabel: formatCurrency(Number(d.net_sales || 0)),
                }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top pizzas</CardTitle>
            <CardDescription>By units sold</CardDescription>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <EmptyNote />
            ) : (
              <BarList
                items={top.map((p) => ({
                  label: p.name,
                  value: Number(p.units_sold || 0),
                  valueLabel: `${p.units_sold}`,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment mix · last 7 days</CardTitle>
          <CardDescription>Captured revenue by tender</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyNote />
          ) : (
            <BarList
              items={payments.map((m) => ({
                label: capitalize(m.method),
                value: Number(m.amount || 0),
                valueLabel: formatCurrency(Number(m.amount || 0)),
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders per hour</CardTitle>
          <CardDescription>Hourly trend · last 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && hourly.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Loading chart…</p>
          ) : hourly.length === 0 ? (
            <EmptyNote />
          ) : (
            <OrdersPerHourChart points={hourly} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-extrabold tabular-nums text-brand-dark">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

/** Horizontal bars with a label + value; value labels keep it accessible (not color-only). */
function BarList({ items }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-2.5">
      {items.map((it, idx) => (
        <li key={idx}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium text-foreground">{it.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{it.valueLabel}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.max((it.value / max) * 100, it.value > 0 ? 4 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyNote() {
  return <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function formatDay(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function OrdersPerHourChart({ points }) {
  const maxCount = Math.max(1, ...points.map((p) => p.orders_count ?? 0))
  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom

  const coords = points.map((p, i) => {
    const x = PAD.left + (i / Math.max(points.length - 1, 1)) * innerW
    const y = PAD.top + innerH - ((p.orders_count ?? 0) / maxCount) * innerH
    return { x, y, ...p }
  })

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const areaPath =
    linePath +
    ` L ${coords[coords.length - 1].x} ${PAD.top + innerH}` +
    ` L ${coords[0].x} ${PAD.top + innerH} Z`

  const yTicks = [0, Math.ceil(maxCount / 2), maxCount]
  const xLabelIndices = pickLabelIndices(points.length, 6)

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-muted/20 p-3">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-auto w-full min-w-[320px]"
        role="img"
        aria-label="Line chart of orders per hour over the last seven days"
      >
        {yTicks.map((tick) => {
          const y = PAD.top + innerH - (tick / maxCount) * innerH
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                y1={y}
                x2={CHART_W - PAD.right}
                y2={y}
                stroke="hsl(214 32% 91%)"
                strokeDasharray="4 4"
              />
              <text
                x={PAD.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {tick}
              </text>
            </g>
          )
        })}

        <path d={areaPath} fill="hsl(21 90% 48% / 0.12)" />
        <path
          d={linePath}
          fill="none"
          stroke="hsl(21 90% 48%)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {coords.map((c, i) => (
          <g key={c.order_hour}>
            <circle cx={c.x} cy={c.y} r="3.5" fill="hsl(21 90% 48%)" />
            {c.orders_count > 0 && (
              <title>{`${formatHourLabel(c.order_hour)}: ${c.orders_count} orders`}</title>
            )}
            {xLabelIndices.includes(i) && (
              <text
                x={c.x}
                y={CHART_H - 10}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {formatHourLabel(c.order_hour, true)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

function pickLabelIndices(length, maxLabels) {
  if (length <= maxLabels) return [...Array(length).keys()]
  const step = Math.floor((length - 1) / (maxLabels - 1))
  const indices = []
  for (let i = 0; i < length; i += step) indices.push(i)
  if (indices[indices.length - 1] !== length - 1) indices.push(length - 1)
  return indices
}

function formatHourLabel(iso, short = false) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  if (short) {
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      hour: 'numeric',
    })
  }
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
  })
}
