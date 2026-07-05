import { useEffect, useState } from 'react'
import {
  getTopProducts,
  getAnalyticsSummary,
  getSalesRange,
} from '@/lib/analyticsStore'
import { formatCurrency } from '@/lib/billing'
import { formatKpiPrimary, formatKpiSecondary } from '@/lib/analyticsFormat'
import {
  getDetailDefinition,
  getPanelDefinition,
  detailKeyFromQuadrant,
} from '@/lib/analyticsDefinitions'
import CooBriefing from '@/components/CooBriefing'
import CooChat, { CooChatFab } from '@/components/CooChat'
import AnalyticsCategoryStack from '@/components/analytics/AnalyticsCategoryStack'
import AnalyticsDetailCard from '@/components/analytics/AnalyticsDetailCard'
import { C, FONT_DISPLAY, FONT_MONO } from '@/components/order/theme'
import PizzaLoader from '@/components/order/PizzaLoader'

const CATEGORY_ORDER = ['order_times', 'cancellations', 'table_utilisation', 'sales']

const PAY_COLORS = { cash: C.red, upi: '#e0913a', card: C.green, wallet: C.gold, other: C.brown2 }

export default function AdminAnalytics() {
  const [summary, setSummary] = useState(null)
  const [topProducts, setTopProducts] = useState([])
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatContext, setChatContext] = useState(null)
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem('analytics_hint_dismissed') === '1'
  )

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      const [s, top] = await Promise.all([getAnalyticsSummary(7), getTopProducts(8)])
      if (!s) {
        setLoadError('Could not load analytics from the server.')
      }
      setSummary(s)
      setTopProducts(top)
    } catch {
      setLoadError('Could not load analytics from the server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function dismissHint() {
    localStorage.setItem('analytics_hint_dismissed', '1')
    setHintDismissed(true)
  }

  function handleAskFollowUp(ctx) {
    setChatContext(ctx)
    setChatOpen(true)
  }

  const order = summary?.category_order ?? CATEGORY_ORDER
  const cats = summary?.categories ?? {}

  return (
    <main className="relative min-w-0 flex-1 px-6 py-7 pb-24 sm:px-8" style={{ animation: 'floatUp .35s ease both' }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 34, margin: 0, color: C.ink }}>
            Analytics
          </h1>
          <div className="mt-1.5" style={{ fontSize: 13.5, color: C.brown2, fontWeight: 600 }}>
            Ops-first · Asia/Kolkata · last 7 days
          </div>
        </div>
        <RefreshButton onClick={refresh} loading={loading} />
      </div>

      {loadError && (
        <p role="alert" className="mb-4" style={{ fontSize: 14, color: C.red, fontWeight: 600 }}>
          {loadError}
        </p>
      )}

      <CooBriefing onAskFollowUp={handleAskFollowUp} />

      {!hintDismissed && (
        <div
          className="mb-4 flex items-center justify-between rounded-xl px-4 py-3"
          style={{ background: C.goldBg, border: `1px solid ${C.border}` }}
        >
          <span style={{ fontSize: 13, color: C.brown, fontWeight: 600 }}>Tap a category for details</span>
          <button type="button" onClick={dismissHint} className="font-bold" style={{ fontSize: 12, color: C.brown2 }}>
            Dismiss
          </button>
        </div>
      )}

      {loading && !summary ? (
        <AnalyticsSkeleton />
      ) : (
        order.map((key) => {
          const cat = cats[key]
          if (!cat) return null
          const detailsId = `analytics-${key}-details`
          return (
            <AnalyticsCategoryStack
              key={key}
              category={key}
              primaryValue={formatKpiPrimary(key, cat.primary)}
              secondaryLine={formatKpiSecondary(key, cat.secondary, cat.details)}
              trend={cat.trend}
              trendSentiment={cat.trend?.sentiment ?? (key === 'sales' ? 'positive' : 'negative')}
              expanded={openId === key}
              onToggle={() => setOpenId(openId === key ? null : key)}
              stackDepth={2}
              detailsId={detailsId}
              showExpandHint={hintDismissed}
            >
              <CategoryDetails category={key} cat={cat} topProducts={topProducts} />
            </AnalyticsCategoryStack>
          )
        })
      )}

      <CooChatFab onClick={() => { setChatContext(null); setChatOpen(true) }} />
      <CooChat open={chatOpen} onClose={() => setChatOpen(false)} briefingContext={chatContext} />
    </main>
  )
}

function CategoryDetails({ category, cat, topProducts }) {
  const d = cat.details ?? {}
  if (category === 'order_times') {
    return (
      <>
        <AnalyticsDetailCard
          title="Prep p90"
          definition={getDetailDefinition('prep_p90')}
          value={d.p90_prep_minutes != null ? `${d.p90_prep_minutes} min` : '—'}
        />
        <AnalyticsDetailCard
          title="Backlog now"
          definition={getDetailDefinition('backlog_now')}
          value={String(d.backlog_now ?? 0)}
        />
        {(d.product_matrix ?? []).slice(0, 4).map((row) => (
          <AnalyticsDetailCard
            key={row.pizza_name}
            title={row.quadrant}
            definition={getDetailDefinition(detailKeyFromQuadrant(row.quadrant))}
            value={row.pizza_name}
          >
            {row.avg_prep_minutes != null ? `${row.avg_prep_minutes} min · ` : ''}
            ₹{Math.round(row.revenue || 0).toLocaleString('en-IN')}
          </AnalyticsDetailCard>
        ))}
      </>
    )
  }
  if (category === 'cancellations') {
    return (
      <>
        <AnalyticsDetailCard
          title="Revenue lost"
          definition={getDetailDefinition('revenue_lost')}
          value={money0(d.revenue_lost)}
        />
        {(d.top_items ?? []).map((it) => (
          <AnalyticsDetailCard
            key={it.pizza_name}
            title="Top cancelled"
            definition={getDetailDefinition('top_cancelled')}
            value={it.pizza_name}
          >
            {it.cancelled_orders} orders · {it.cancelled_units} units
          </AnalyticsDetailCard>
        ))}
        {(d.by_stage ?? []).map((st) => (
          <AnalyticsDetailCard
            key={st.stage}
            title="Cancel stage"
            definition={getDetailDefinition('cancel_stage')}
            value={`${st.stage} (${st.pct}%)`}
          >
            {st.count} cancels
          </AnalyticsDetailCard>
        ))}
        {(d.recent ?? []).map((r) => (
          <AnalyticsDetailCard
            key={r.order_code}
            title="Recent cancel"
            definition={getDetailDefinition('recent_cancel')}
            value={r.order_code}
          >
            {r.table} · {r.stage} · {money0(r.total)}
          </AnalyticsDetailCard>
        ))}
      </>
    )
  }
  if (category === 'table_utilisation') {
    return (
      <>
        <AnalyticsDetailCard
          title="Busiest table"
          definition={getDetailDefinition('busiest_table')}
          value={d.busiest_table ?? '—'}
        >
          {d.busiest_sessions ?? 0} sessions
        </AnalyticsDetailCard>
        <AnalyticsDetailCard
          title="Tables in use now"
          definition={getDetailDefinition('tables_in_use_now')}
          value={String(d.tables_in_use_now ?? 0)}
        />
      </>
    )
  }
  if (category === 'sales') {
    const daily = d.sales_daily ?? []
    const payments = d.payment_mix ?? []
    const top = d.top_pizza ?? topProducts[0]
    return (
      <>
        <AnalyticsDetailCard
          title="Avg ticket"
          definition={getDetailDefinition('avg_ticket')}
          value={money0(d.avg_ticket)}
        />
        {top && (
          <AnalyticsDetailCard
            title="Top pizza"
            definition={getDetailDefinition('top_pizza')}
            value={top.name}
          >
            {top.units_sold} sold
          </AnalyticsDetailCard>
        )}
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <PanelTitle>Sales · last 7 days</PanelTitle>
          <PanelSub>{getPanelDefinition('sales_7d')}</PanelSub>
          {daily.length ? <SalesBars daily={daily} /> : <EmptyNote />}
        </div>
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <PanelTitle>Payment mix</PanelTitle>
          <PanelSub>{getPanelDefinition('payment_mix')}</PanelSub>
          {payments.length ? <PaymentDonut payments={payments} /> : <EmptyNote />}
        </div>
        {topProducts.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
            <PanelTitle>Top pizzas</PanelTitle>
            <PanelSub>{getPanelDefinition('top_pizzas')}</PanelSub>
            <TopPizzas top={topProducts} />
          </div>
        )}
        {daily.length > 0 && (
          <CustomRangePanel
            defaultStart={daily[0]?.business_date ?? ''}
            defaultEnd={daily[daily.length - 1]?.business_date ?? ''}
          />
        )}
      </>
    )
  }
  return null
}

function money0(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading analytics">
      {CATEGORY_ORDER.map((key) => (
        <div
          key={key}
          className="relative isolate rounded-[20px] p-6"
          style={{ background: '#faf6ef', border: `1px solid ${C.border}`, minHeight: 112 }}
        >
          <div
            className="absolute bottom-0 left-0 top-0 w-1 rounded-l-[20px]"
            style={{ background: C.border }}
            aria-hidden
          />
          <div
            className="mb-3 h-3 w-24 rounded"
            style={{ background: '#eee0c8' }}
          />
          <div
            className="mb-2 h-8 w-32 rounded"
            style={{ background: '#eee0c8' }}
          />
          <div
            className="h-3 w-40 rounded"
            style={{ background: '#f2e7d4' }}
          />
        </div>
      ))}
      <div className="py-4">
        <PizzaLoader variant="inline" />
      </div>
    </div>
  )
}

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

function PanelTitle({ children }) {
  return <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 22, margin: '0 0 12px', color: C.ink }}>{children}</h2>
}

function PanelSub({ children }) {
  return <p style={{ fontSize: 12, color: C.brown3, fontWeight: 600, margin: '0 0 12px', lineHeight: 1.35 }}>{children}</p>
}

function Panel({ children }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
      {children}
    </div>
  )
}

function EmptyNote() {
  return <p className="py-6 text-center" style={{ fontSize: 14, color: C.brown2 }}>No data yet.</p>
}

/** Friendly label for a 'YYYY-MM-DD' business date, e.g. "Sat, 5 Jul". */
function fmtDay(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

const RANGE_GRID = '1.4fr 0.7fr 1fr 1fr 1fr'

/**
 * Custom date-range panel: pick a From/To business date and see day-wise sales
 * (orders, gross, discount, net) plus range totals. Queries the backend directly
 * through the read seam (self-defaulting), so a failure just shows "no data".
 */
function CustomRangePanel({ defaultStart, defaultEnd }) {
  const [start, setStart] = useState(defaultStart || '')
  const [end, setEnd] = useState(defaultEnd || '')
  const [rows, setRows] = useState(null) // null = not queried yet
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function apply() {
    if (!start || !end) return setError('Pick both a start and end date.')
    if (start > end) return setError('Start date must be on or before the end date.')
    setError('')
    setLoading(true)
    setRows(await getSalesRange(start, end))
    setLoading(false)
  }

  const list = rows ?? []
  const totals = list.reduce(
    (a, d) => ({
      orders: a.orders + Number(d.orders_count || 0),
      gross: a.gross + Number(d.gross_sales || 0),
      discount: a.discount + Number(d.discounts || 0),
      net: a.net + Number(d.net_sales || 0),
    }),
    { orders: 0, gross: 0, discount: 0, net: 0 }
  )

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: C.goldBg, border: `2px solid ${C.goldBorder}` }}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PanelTitle>Custom date range</PanelTitle>
          <PanelSub>{getPanelDefinition('custom_range')}</PanelSub>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <DateField label="From" value={start} max={end || undefined} onChange={setStart} />
          <DateField label="To" value={end} min={start || undefined} onChange={setEnd} />
          <button
            type="button"
            onClick={apply}
            disabled={loading}
            className="rounded-xl px-5 py-2.5 font-bold disabled:opacity-60"
            style={{ background: C.red, color: C.cream, fontSize: 14, boxShadow: '0 4px 0 #e0a93f' }}
          >
            {loading ? 'Loading…' : 'Apply'}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3" style={{ fontSize: 13.5, color: C.red, fontWeight: 600 }}>
          {error}
        </p>
      )}

      {loading ? (
        <PizzaLoader variant="inline" />
      ) : rows === null ? (
        <p className="py-8 text-center" style={{ fontSize: 14, color: C.brown2, fontWeight: 600 }}>
          Pick dates above, then Apply.
        </p>
      ) : list.length === 0 ? (
        <EmptyNote />
      ) : (
        <>
          {/* range totals */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <RangeStat label="Orders" value={String(totals.orders)} />
            <RangeStat label="Gross" value={money0(totals.gross)} />
            <RangeStat label="Discount" value={money0(totals.discount)} accent />
            <RangeStat label="Net" value={money0(totals.net)} />
          </div>

          {/* day-wise table */}
          <div className="overflow-x-auto">
            <div style={{ minWidth: 460 }}>
              <div
                className="grid gap-2 px-3 py-2 uppercase"
                style={{
                  gridTemplateColumns: RANGE_GRID,
                  fontSize: 11,
                  letterSpacing: '0.06em',
                  color: C.brown3,
                  fontWeight: 700,
                }}
              >
                <div>Day</div>
                <div className="text-right">Orders</div>
                <div className="text-right">Gross</div>
                <div className="text-right">Discount</div>
                <div className="text-right">Net</div>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {list.map((d) => {
                  const empty = Number(d.orders_count || 0) === 0
                  return (
                    <div
                      key={d.business_date}
                      className="grid items-center gap-2 px-3 py-2.5"
                      style={{ gridTemplateColumns: RANGE_GRID, borderTop: `1px solid ${C.border}` }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: empty ? C.brown3 : C.ink }}>
                        {fmtDay(d.business_date)}
                      </div>
                      <div className="text-right tabular-nums" style={{ fontSize: 13, color: C.brown }}>
                        {d.orders_count || 0}
                      </div>
                      <div className="text-right tabular-nums" style={{ fontSize: 13, color: C.brown }}>
                        {empty ? '—' : formatCurrency(d.gross_sales)}
                      </div>
                      <div className="text-right tabular-nums" style={{ fontSize: 13, color: empty ? C.brown3 : C.red, fontWeight: 600 }}>
                        {Number(d.discounts || 0) > 0 ? `−${formatCurrency(d.discounts)}` : '—'}
                      </div>
                      <div className="text-right tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: empty ? C.brown3 : C.ink }}>
                        {empty ? '—' : formatCurrency(d.net_sales)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function DateField({ label, value, onChange, min, max }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="uppercase" style={{ fontSize: 10.5, letterSpacing: '0.08em', color: C.brown3, fontWeight: 700 }}>
        {label}
      </span>
      <span className="relative inline-flex items-center">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 select-none"
          style={{ fontSize: 15, lineHeight: 1 }}
        >
          📅
        </span>
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-xl py-3 pl-10 pr-3 outline-none focus-visible:border-[#a5601f] focus-visible:shadow-[0_0_0_3px_rgba(165,96,31,0.22)]"
          style={{
            border: `1.5px solid ${C.goldBorder}`,
            background: '#fff',
            color: C.ink,
            fontSize: 14,
            fontWeight: 600,
            minHeight: 44,
          }}
        />
      </span>
    </label>
  )
}

function RangeStat({ label, value, accent }) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: accent ? C.goldBg : C.cream, border: `1px solid ${C.border}` }}
    >
      <div className="uppercase" style={{ fontSize: 11, letterSpacing: '0.06em', color: C.brown3, fontWeight: 700 }}>
        {label}
      </div>
      <div className="mt-1 tabular-nums" style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: accent ? C.gold : C.ink }}>
        {value}
      </div>
    </div>
  )
}

function SalesBars({ daily }) {
  const max = Math.max(1, ...daily.map((d) => Number(d.net_sales || 0)))
  return (
    <div className="flex h-[160px] items-end gap-2 pt-2">
      {daily.map((d) => {
        const v = Number(d.net_sales || 0)
        return (
          <div key={d.business_date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.brown2 }}>{v === 0 ? '—' : money0(v)}</div>
            <div
              className="w-full"
              style={{
                height: `${v === 0 ? 3 : Math.max(6, (v / max) * 100)}%`,
                borderRadius: '6px 6px 2px 2px',
                background: v === 0 ? '#eee0c8' : '#f0b06a',
                animation: 'drawBar .6s ease both',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

function PaymentDonut({ payments }) {
  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const CIRC = 100
  let acc = 0
  const segments = payments.map((p) => {
    const frac = total > 0 ? Number(p.amount || 0) / total : 0
    const seg = {
      color: PAY_COLORS[p.method] ?? C.brown2,
      dash: `${Math.max(frac * CIRC - 1.5, 0)} ${CIRC}`,
      offset: -acc * CIRC + 0.75,
    }
    acc += frac
    return seg
  })
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 42 42" className="h-24 w-24" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f2e7d4" strokeWidth="6" />
        {segments.map((s, i) => (
          <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={s.color} strokeWidth="6" strokeDasharray={s.dash} strokeDashoffset={s.offset} />
        ))}
      </svg>
      <div className="flex flex-col gap-2 text-sm">
        {payments.map((p) => (
          <div key={p.method}>{p.method}: {money0(p.amount)}</div>
        ))}
      </div>
    </div>
  )
}

function TopPizzas({ top }) {
  const max = Math.max(1, ...top.map((p) => Number(p.units_sold || 0)))
  return (
    <div className="flex flex-col gap-3">
      {top.slice(0, 5).map((p) => (
        <div key={p.name} className="flex items-center gap-3">
          <span className="w-24 truncate font-bold">{p.name}</span>
          <div className="h-2 flex-1 rounded-full" style={{ background: '#f2e7d4' }}>
            <div className="h-full rounded-full" style={{ width: `${(p.units_sold / max) * 100}%`, background: C.red }} />
          </div>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12 }}>{p.units_sold}</span>
        </div>
      ))}
    </div>
  )
}
