import { useEffect, useState } from 'react'
import {
  getOrdersPerHour,
  getTopProducts,
  getSalesDaily,
  getPaymentMix,
} from '@/lib/analyticsStore'
import { formatCurrency } from '@/lib/billing'
import { C, FONT_DISPLAY, FONT_MONO } from '@/components/order/theme'
import PizzaLoader from '@/components/order/PizzaLoader'

/** Compact rupees for summary figures (KPIs, bars) — matches the admin comp. */
function money0(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
}

const PAY_COLORS = {
  cash: C.red,
  upi: '#e0913a',
  card: C.green,
  wallet: C.gold,
  other: C.brown2,
}

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

  // KPIs from the full 7-day window.
  const net7 = daily.reduce((s, d) => s + Number(d.net_sales || 0), 0)
  const orders7 = daily.reduce((s, d) => s + Number(d.orders_count || 0), 0)
  const avgOrder = orders7 > 0 ? net7 / orders7 : 0
  const topPizza = top[0]

  const kpis = [
    { label: 'Net sales · 7d', value: money0(net7), sub: 'last 7 days', icon: '₹' },
    { label: 'Orders · 7d', value: String(orders7), sub: 'last 7 days', icon: '🧾' },
    { label: 'Avg. order', value: money0(avgOrder), sub: 'per ticket', icon: '⌀' },
    {
      label: 'Top pizza',
      value: topPizza?.name ?? '—',
      sub: topPizza ? `${topPizza.units_sold} sold` : 'this week',
      icon: '🍕',
      accent: true,
    },
  ]

  return (
    <main
      className="min-w-0 flex-1 px-6 py-7 sm:px-8"
      style={{ animation: 'floatUp .35s ease both' }}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 34, margin: 0, color: C.ink }}>
            Analytics
          </h1>
          <div className="mt-1.5" style={{ fontSize: 13.5, color: C.brown2, fontWeight: 600 }}>
            Live from the API · Asia/Kolkata · last 7 days
          </div>
        </div>
        <RefreshButton onClick={refresh} loading={loading} />
      </div>

      {loadError && (
        <p role="alert" className="mb-4" style={{ fontSize: 14, color: C.red, fontWeight: 600 }}>
          {loadError}
        </p>
      )}

      {/* KPI CARDS */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {/* CHART ROW */}
      <div className="mb-5 grid gap-[18px] lg:grid-cols-[1.35fr_1fr]">
        <Panel>
          <div className="mb-5 flex items-start justify-between">
            <div>
              <PanelTitle>Sales · last 7 days</PanelTitle>
              <PanelSub>Net revenue per day</PanelSub>
            </div>
            <div className="text-right">
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: C.red }}>{money0(net7)}</div>
              <div style={{ fontSize: 11.5, color: C.brown2, fontWeight: 600 }}>this week</div>
            </div>
          </div>
          {daily.length === 0 ? <EmptyNote /> : <SalesBars daily={daily} />}
        </Panel>

        <Panel>
          <PanelTitle>Payment mix</PanelTitle>
          <PanelSub>Captured revenue · 7 days</PanelSub>
          {payments.length === 0 ? <EmptyNote /> : <PaymentDonut payments={payments} />}
        </Panel>
      </div>

      {/* TOP PIZZAS */}
      <Panel>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <PanelTitle>Top pizzas</PanelTitle>
            <PanelSub>By units sold · last 7 days</PanelSub>
          </div>
          {top.length > 0 && (
            <span
              className="rounded-full px-3.5 py-1.5"
              style={{ background: C.goldBg, color: C.gold, fontWeight: 700, fontSize: 12.5 }}
            >
              {top.reduce((s, p) => s + Number(p.units_sold || 0), 0)} pizzas sold
            </span>
          )}
        </div>
        {top.length === 0 ? <EmptyNote /> : <TopPizzas top={top} />}
      </Panel>

      {/* ORDERS PER HOUR (kept from the existing dashboard, restyled) */}
      <div className="mt-5">
        <Panel>
          <PanelTitle>Orders per hour</PanelTitle>
          <PanelSub>Hourly trend · last 7 days</PanelSub>
          <div className="mt-4">
            {loading && hourly.length === 0 ? (
              <PizzaLoader variant="inline" />
            ) : hourly.length === 0 ? (
              <EmptyNote />
            ) : (
              <OrdersPerHourChart points={hourly} />
            )}
          </div>
        </Panel>
      </div>
    </main>
  )
}

/* ------------------------------ pieces ---------------------------------- */

function RefreshButton({ onClick, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded-xl px-5 py-2.5 font-bold disabled:opacity-60"
      style={{ border: `1.5px solid ${C.border2}`, background: '#fff', color: C.ink, fontSize: 14 }}
    >
      {loading ? 'Loading…' : '↻ Refresh'}
    </button>
  )
}

function Panel({ children }) {
  return (
    <div
      className="rounded-[20px] p-6"
      style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 4px 0 ${C.border}` }}
    >
      {children}
    </div>
  )
}

function PanelTitle({ children }) {
  return <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 22, margin: 0, color: C.ink }}>{children}</h2>
}

function PanelSub({ children }) {
  return <div className="mt-1" style={{ fontSize: 12.5, color: C.brown2, fontWeight: 600 }}>{children}</div>
}

function EmptyNote() {
  return <p className="py-8 text-center" style={{ fontSize: 14, color: C.brown2 }}>No data yet.</p>
}

function KpiCard({ label, value, sub, icon, accent }) {
  return (
    <div
      className="rounded-[20px] p-[22px]"
      style={
        accent
          ? { background: 'linear-gradient(150deg,#c5341c,#a2280f)', boxShadow: '0 4px 0 #e0a93f' }
          : { background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 4px 0 ${C.border}` }
      }
    >
      <div className="flex items-center justify-between">
        <div
          className="uppercase"
          style={{ fontSize: 12, letterSpacing: '0.06em', fontWeight: 700, color: accent ? '#f7cdae' : C.brown3 }}
        >
          {label}
        </div>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-[9px]"
          style={
            accent
              ? { background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 15, fontWeight: 700 }
              : { background: C.goldBg, color: '#b06514', fontSize: 15, fontWeight: 700 }
          }
        >
          {icon}
        </span>
      </div>
      <div
        className="mt-3.5 truncate"
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 32,
          lineHeight: 1.1,
          color: accent ? '#fff' : label === 'Top pizza' ? C.red : C.ink,
        }}
      >
        {value}
      </div>
      <div className="mt-2" style={{ fontSize: 12, color: accent ? '#f2b79c' : C.brown2, fontWeight: 600 }}>
        {sub}
      </div>
    </div>
  )
}

function SalesBars({ daily }) {
  const max = Math.max(1, ...daily.map((d) => Number(d.net_sales || 0)))
  return (
    <div className="flex h-[200px] items-end gap-3.5 pt-2.5">
      {daily.map((d) => {
        const v = Number(d.net_sales || 0)
        const isPeak = v === max && v > 0
        return (
          <div key={d.business_date} className="flex h-full flex-1 flex-col items-center justify-end gap-2.5">
            <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 700, color: C.brown2 }}>
              {v === 0 ? '—' : money0(v)}
            </div>
            <div
              className="w-full"
              style={{
                height: `${v === 0 ? 3 : Math.max(6, (v / max) * 100)}%`,
                borderRadius: '8px 8px 3px 3px',
                background: isPeak ? 'linear-gradient(#e0562e,#c5341c)' : v === 0 ? '#eee0c8' : '#f0b06a',
                boxShadow: isPeak ? '0 8px 18px rgba(197,52,28,0.28)' : 'none',
                transformOrigin: 'bottom',
                animation: 'drawBar .6s cubic-bezier(.22,1,.36,1) both',
              }}
            />
            <div style={{ fontSize: 11.5, fontWeight: 700, color: isPeak ? C.red : C.brown2 }}>
              {formatWeekday(d.business_date)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PaymentDonut({ payments }) {
  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const CIRC = 100 // circumference of r=15.915
  let acc = 0
  const segments = payments.map((p) => {
    const frac = total > 0 ? Number(p.amount || 0) / total : 0
    const seg = {
      color: PAY_COLORS[p.method] ?? C.brown2,
      dash: `${Math.max(frac * CIRC - 1.5, 0)} ${CIRC - Math.max(frac * CIRC - 1.5, 0)}`,
      offset: -acc * CIRC + 0.75,
    }
    acc += frac
    return seg
  })
  const legend = payments.map((p) => ({
    name: capitalize(p.method),
    color: PAY_COLORS[p.method] ?? C.brown2,
    amount: money0(p.amount),
    pct: total > 0 ? Math.round((Number(p.amount || 0) / total) * 100) + '%' : '0%',
  }))
  const centerLabel = total >= 1000 ? '₹' + Math.round((total / 1000) * 10) / 10 + 'k' : money0(total)

  return (
    <div className="mt-4 flex items-center gap-6">
      <div className="relative h-[150px] w-[150px] flex-none">
        <svg viewBox="0 0 42 42" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f2e7d4" strokeWidth="6" />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx="21"
              cy="21"
              r="15.915"
              fill="none"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={s.dash}
              strokeDashoffset={s.offset}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: C.ink, lineHeight: 1 }}>{centerLabel}</div>
          <div className="uppercase" style={{ fontSize: 10, letterSpacing: '0.1em', color: C.brown3, fontWeight: 700 }}>
            captured
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        {legend.map((p) => (
          <div key={p.name} className="flex items-center gap-2.5">
            <span className="h-[11px] w-[11px] flex-none rounded-[3px]" style={{ background: p.color }} />
            <div className="min-w-0 flex-1">
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{p.name}</div>
              <div style={{ fontSize: 11.5, color: C.brown2, fontWeight: 600 }}>{p.pct}</div>
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, color: C.brown }}>{p.amount}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopPizzas({ top }) {
  const list = top.slice(0, 5)
  const max = Math.max(1, ...list.map((p) => Number(p.units_sold || 0)))
  return (
    <div className="flex flex-col gap-4">
      {list.map((p, i) => (
        <div key={p.name} className="flex items-center gap-4">
          <div
            className="flex-none text-center"
            style={{ width: 26, fontFamily: FONT_DISPLAY, fontSize: 18, color: i === 0 ? C.red : '#c0ab8c' }}
          >
            {'0' + (i + 1)}
          </div>
          <div className="flex-none truncate" style={{ width: 150, fontSize: 14, fontWeight: 700, color: C.ink }}>
            {p.name}
          </div>
          <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: '#f2e7d4' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${(Number(p.units_sold || 0) / max) * 100}%`,
                background: i === 0 ? 'linear-gradient(90deg,#e0562e,#c5341c)' : '#f0b06a',
                animation: 'growW .7s cubic-bezier(.22,1,.36,1) both',
              }}
            />
          </div>
          <div
            className="flex-none text-right"
            style={{ width: 70, fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: C.brown }}
          >
            {p.units_sold} sold
          </div>
        </div>
      ))}
    </div>
  )
}

/* --------------------------- orders/hour line -------------------------- */

const CHART_W = 1100
const CHART_H = 220
const PAD = { top: 16, right: 12, bottom: 36, left: 36 }

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
    <div className="overflow-x-auto rounded-2xl p-3" style={{ background: C.cream, border: `1px solid ${C.border}` }}>
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
              <line x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y} stroke="#e3d4bc" strokeDasharray="4 4" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="#a0876a" fontSize="10">
                {tick}
              </text>
            </g>
          )
        })}

        <path d={areaPath} fill="rgba(197,52,28,0.12)" />
        <path d={linePath} fill="none" stroke={C.red} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {coords.map((c, i) => (
          <g key={c.order_hour}>
            <circle cx={c.x} cy={c.y} r="3.5" fill={C.red} />
            {c.orders_count > 0 && <title>{`${formatHourLabel(c.order_hour)}: ${c.orders_count} orders`}</title>}
            {xLabelIndices.includes(i) && (
              <text x={c.x} y={CHART_H - 10} textAnchor="middle" fill="#a0876a" fontSize="9">
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

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function formatWeekday(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { weekday: 'short' })
}

function formatHourLabel(iso, short = false) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  if (short) {
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: 'numeric' })
  }
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
  })
}
