import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@/components/ui/primitives'
import { getOrdersPerHour } from '@/lib/analyticsStore'

const CHART_W = 1100
const CHART_H = 220
const PAD = { top: 16, right: 12, bottom: 36, left: 36 }

export default function AdminAnalytics() {
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getOrdersPerHour()
      setPoints(data.points ?? [])
    } catch {
      setLoadError('Could not load analytics from the server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const totalOrders = useMemo(
    () => points.reduce((sum, p) => sum + (p.orders_count ?? 0), 0),
    [points]
  )
  const peak = useMemo(() => {
    if (!points.length) return null
    return points.reduce((best, p) =>
      (p.orders_count ?? 0) > (best.orders_count ?? 0) ? p : best
    )
  }, [points])

  return (
    <Card className="w-full min-w-0 flex-1">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Orders per hour</CardTitle>
          <CardDescription>
            Hourly trend · last 7 days (Asia/Kolkata)
            {totalOrders > 0 && ` · ${totalOrders} orders total`}
          </CardDescription>
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
        {loading && points.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading chart…</p>
        ) : points.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No orders yet — place one from the Order tab to see the trend.
          </p>
        ) : (
          <div className="space-y-4">
            {peak && peak.orders_count > 0 && (
              <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Peak hour: </span>
                <span className="font-semibold text-brand-dark">
                  {formatHourLabel(peak.order_hour)} · {peak.orders_count} order
                  {peak.orders_count === 1 ? '' : 's'}
                </span>
              </div>
            )}
            <OrdersPerHourChart points={points} />
          </div>
        )}
      </CardContent>
    </Card>
  )
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
