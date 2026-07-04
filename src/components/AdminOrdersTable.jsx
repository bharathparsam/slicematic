import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import AdminAnalytics from '@/components/AdminAnalytics'
import { getAllOrders, completeOrder, cancelOrder } from '@/lib/orderStore'
import { formatCurrency } from '@/lib/billing'
import { C, FONT_DISPLAY, FONT_MONO } from '@/components/order/theme'

const PLACEHOLDER_PASSWORD = 'slice123'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

// Orders table column template (kept in sync between the header + body rows).
const GRID = '96px 100px 72px minmax(120px,1.2fr) minmax(180px,2fr) 48px 108px 66px minmax(168px,1fr)'

export default function AdminOrdersTable({ onModify, onExit, unlocked, onUnlock }) {
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [completingId, setCompletingId] = useState('')
  const [confirmOrder, setConfirmOrder] = useState(null)
  const [cancellingId, setCancellingId] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [section, setSection] = useState('orders')
  const [filter, setFilter] = useState('all')

  // Unlock state is owned by App so it survives the Modify round-trip (this
  // component unmounts while the order is edited in the Order view).
  useEffect(() => {
    if (unlocked) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked])

  function tryUnlock(e) {
    e.preventDefault()
    if (pw === PLACEHOLDER_PASSWORD) {
      onUnlock()
      setPwError('')
    } else {
      setPwError('Incorrect password.')
    }
  }

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      setOrders(await getAllOrders())
    } catch {
      setLoadError('Could not load orders from the server.')
    } finally {
      setLoading(false)
    }
  }

  function openCompleteDialog(o) {
    setLoadError('')
    setConfirmOrder(o)
  }
  function closeCompleteDialog() {
    if (completingId) return
    setConfirmOrder(null)
  }
  async function confirmComplete() {
    if (!confirmOrder) return
    setCompletingId(confirmOrder.id)
    setLoadError('')
    const result = await completeOrder(confirmOrder.id)
    setCompletingId('')
    if (result.ok) {
      setConfirmOrder(null)
      await refresh()
    } else {
      setLoadError(result.message || 'Could not complete the order.')
    }
  }

  function openCancelDialog(o) {
    setLoadError('')
    setCancelTarget(o)
  }
  function closeCancelDialog() {
    if (cancellingId) return
    setCancelTarget(null)
  }
  async function confirmCancel() {
    if (!cancelTarget) return
    setCancellingId(cancelTarget.id)
    setLoadError('')
    const result = await cancelOrder(cancelTarget.id)
    setCancellingId('')
    if (result.ok) {
      setCancelTarget(null)
      await refresh()
    } else {
      setLoadError(result.message || 'Could not cancel the order.')
    }
  }

  const activeCount = orders.filter((o) => normStatus(o.status) === 'active').length
  const filtered = filter === 'all' ? orders : orders.filter((o) => normStatus(o.status) === filter)

  // "Today so far" — non-cancelled orders placed today (client-derived, no new API).
  const todays = orders.filter((o) => normStatus(o.status) !== 'cancelled' && isToday(o.timestamp))
  const todaySalesN = todays.reduce((s, o) => s + Number(o.total || 0), 0)
  const todayAvgN = todays.length ? todaySalesN / todays.length : 0

  return (
    <div
      className="flex min-h-screen w-full flex-col"
      style={{ background: '#faf3e6', color: C.ink }}
    >
        <AdminConfirmModal
          order={confirmOrder}
          tone="complete"
          busy={!!completingId}
          onCancel={closeCompleteDialog}
          onConfirm={confirmComplete}
        />
        <AdminConfirmModal
          order={cancelTarget}
          tone="cancel"
          busy={!!cancellingId}
          onCancel={closeCancelDialog}
          onConfirm={confirmCancel}
        />

        <TopBar onExit={onExit} />

        {!unlocked ? (
          <GateCard pw={pw} setPw={setPw} pwError={pwError} onSubmit={tryUnlock} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <Sidebar
              section={section}
              setSection={setSection}
              activeCount={activeCount}
              todaySales={formatCurrency(todaySalesN)}
              todayOrders={todays.length}
              todayAvg={formatCurrency(todayAvgN)}
            />

            {section === 'analytics' ? (
              <AdminAnalytics />
            ) : (
              <OrdersPanel
                orders={filtered}
                totalCount={orders.length}
                loading={loading}
                loadError={loadError}
                activeCount={activeCount}
                filter={filter}
                setFilter={setFilter}
                completingId={completingId}
                cancellingId={cancellingId}
                onRefresh={refresh}
                onComplete={openCompleteDialog}
                onModify={onModify}
                onCancel={openCancelDialog}
              />
            )}
          </div>
        )}
    </div>
  )
}

/* -------------------------------- shell --------------------------------- */

function TopBar({ onExit }) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 sm:px-8"
      style={{ background: C.ink, color: C.cream }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-[42px] w-[42px] items-center justify-center rounded-xl"
          style={{ background: C.red, boxShadow: '0 6px 16px rgba(197,52,28,0.4)' }}
        >
          <span style={{ fontFamily: FONT_DISPLAY, color: C.cream, fontSize: 23, lineHeight: 1 }}>S</span>
        </div>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21 }}>SliceMatic</div>
          <div className="uppercase" style={{ fontSize: 10.5, letterSpacing: '0.16em', color: '#c8a883', fontWeight: 600 }}>
            Order Desk · Admin
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 sm:flex" style={{ fontSize: 13, color: '#d9c6a6', fontWeight: 600 }}>
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: '#5ec26b', boxShadow: '0 0 0 4px rgba(94,194,107,0.2)' }}
          />
          Live · Asia/Kolkata
        </div>
        <div className="flex rounded-full p-1" style={{ background: '#3a2418' }}>
          <button
            type="button"
            onClick={onExit}
            className="rounded-full px-4 py-2 font-semibold"
            style={{ fontSize: 13.5, color: '#c8a883' }}
          >
            Order
          </button>
          <span
            className="rounded-full px-4 py-2 font-bold"
            style={{ fontSize: 13.5, background: C.cream, color: C.ink }}
          >
            Admin
          </span>
        </div>
      </div>
    </header>
  )
}

function Sidebar({ section, setSection, activeCount, todaySales, todayOrders, todayAvg }) {
  const items = [
    { key: 'orders', icon: '📋', label: 'Orders', badge: activeCount || '' },
    { key: 'analytics', icon: '📊', label: 'Analytics', badge: '' },
  ]
  return (
    <aside
      className="flex flex-none flex-col gap-2 p-5 md:w-[236px]"
      style={{ borderRight: `1px solid #eaddc5` }}
    >
      <div
        className="px-3 pb-2 uppercase"
        style={{ fontSize: 11, letterSpacing: '0.18em', color: '#b0987a', fontWeight: 700 }}
      >
        Manage
      </div>
      {items.map((n) => {
        const sel = section === n.key
        return (
          <button
            key={n.key}
            type="button"
            onClick={() => setSection(n.key)}
            aria-current={sel ? 'page' : undefined}
            className="flex items-center justify-between rounded-[13px] px-4 py-3 font-bold transition-colors"
            style={
              sel
                ? { background: C.red, color: C.cream, boxShadow: '0 8px 20px rgba(197,52,28,0.28)', fontSize: 15 }
                : { background: 'transparent', color: C.brown, fontSize: 15 }
            }
          >
            <span className="flex items-center gap-3">
              <span style={{ fontSize: 17 }}>{n.icon}</span>
              {n.label}
            </span>
            {n.badge ? (
              <span
                className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-[7px]"
                style={
                  sel
                    ? { background: 'rgba(255,255,255,0.28)', color: '#fff', fontSize: 12, fontWeight: 800 }
                    : { background: C.red, color: '#fff', fontSize: 12, fontWeight: 800 }
                }
              >
                {n.badge}
              </span>
            ) : null}
          </button>
        )
      })}

      <div
        className="mt-auto rounded-2xl p-4"
        style={{ background: C.goldBg, border: `1px solid ${C.goldBorder}` }}
      >
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: '#8a5a2a' }}>Today so far</div>
        <div className="mt-1" style={{ fontFamily: FONT_DISPLAY, fontSize: 28, color: C.red }}>
          {todaySales}
        </div>
        <div className="mt-0.5" style={{ fontSize: 12, color: C.gold, fontWeight: 600 }}>
          {todayOrders} {todayOrders === 1 ? 'order' : 'orders'} · avg {todayAvg}
        </div>
      </div>
    </aside>
  )
}

function GateCard({ pw, setPw, pwError, onSubmit }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        className="w-full max-w-sm rounded-[20px] p-7"
        style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 4px 0 ${C.border}` }}
      >
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 24, margin: 0, color: C.ink }}>
          Admin access
        </h2>
        <p className="mt-1.5" style={{ fontSize: 13.5, color: C.brown2 }}>
          Placeholder gate — real auth comes with Supabase (Stage 3). Password:{' '}
          <code className="rounded px-1" style={{ background: C.goldBg, color: C.gold }}>
            slice123
          </code>
        </p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label htmlFor="admin-pw" className="block" style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>
            Password
          </label>
          <input
            id="admin-pw"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            aria-invalid={!!pwError}
            aria-describedby={pwError ? 'admin-pw-error' : undefined}
            className="w-full rounded-xl px-3 py-3"
            style={{ border: `1.5px solid ${pwError ? C.red : C.border2}`, background: '#fff', fontSize: 15, color: C.ink }}
          />
          {pwError && (
            <p id="admin-pw-error" role="alert" style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>
              {pwError}
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded-xl py-3 font-bold"
            style={{ background: C.red, color: C.cream, fontSize: 15, boxShadow: '0 10px 22px rgba(197,52,28,0.3)' }}
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------ orders view ----------------------------- */

function OrdersPanel({
  orders,
  totalCount,
  loading,
  loadError,
  activeCount,
  filter,
  setFilter,
  completingId,
  cancellingId,
  onRefresh,
  onComplete,
  onModify,
  onCancel,
}) {
  return (
    <main className="min-w-0 flex-1 px-6 py-7 sm:px-8" style={{ animation: 'floatUp .35s ease both' }}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 34, margin: 0, color: C.ink }}>
            All orders
          </h1>
          <div className="mt-1.5" style={{ fontSize: 13.5, color: C.brown2, fontWeight: 600 }}>
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} · most recent first ·{' '}
            <span style={{ color: C.red }}>{activeCount} active</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex gap-0.5 rounded-xl p-1" style={{ background: '#f0e5d2' }}>
            {FILTERS.map((f) => {
              const sel = filter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className="rounded-[9px] px-3.5 py-2 font-bold transition-colors"
                  style={
                    sel
                      ? { background: '#fff', color: C.ink, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontSize: 13 }
                      : { background: 'transparent', color: C.brown2, fontSize: 13 }
                  }
                >
                  {f.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-xl px-5 py-2.5 font-bold disabled:opacity-60"
            style={{ border: `1.5px solid ${C.border2}`, background: '#fff', color: C.ink, fontSize: 14 }}
          >
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="mb-4" style={{ fontSize: 14, color: C.red, fontWeight: 600 }}>
          {loadError}
        </p>
      )}

      <div
        className="overflow-hidden rounded-[20px]"
        style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 4px 0 ${C.border}` }}
      >
        <div className="overflow-x-auto">
          <div className="w-full min-w-[980px]">
            {/* header */}
            <div
              className="grid items-center gap-3.5 px-6 py-4 uppercase"
              style={{
                gridTemplateColumns: GRID,
                background: C.cream,
                borderBottom: `1px solid ${C.border}`,
                fontSize: 11.5,
                letterSpacing: '0.08em',
                color: '#a0876a',
                fontWeight: 700,
              }}
            >
              <div>Order</div>
              <div>Status</div>
              <div>Table</div>
              <div>Customer</div>
              <div>Items</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Total</div>
              <div>Pay</div>
              <div className="text-right">Actions</div>
            </div>

            {loading && orders.length === 0 ? (
              <p className="py-10 text-center" style={{ fontSize: 14, color: C.brown2 }}>
                Loading orders…
              </p>
            ) : orders.length === 0 ? (
              <p className="py-10 text-center" style={{ fontSize: 14, color: C.brown2 }}>
                {totalCount === 0 ? 'No orders yet. Place one from the Order tab.' : 'No orders match this filter.'}
              </p>
            ) : (
              orders.map((o) => {
                const status = normStatus(o.status)
                const cancelled = status === 'cancelled'
                const active = status === 'active'
                return (
                  <div
                    key={o.id}
                    className="admin-row grid items-center gap-3.5 px-6 py-4 transition-colors"
                    style={{ gridTemplateColumns: GRID, borderBottom: '1px solid #f6ecda' }}
                  >
                    <div style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 13, color: C.red }}>
                      {o.orderCode || '—'}
                    </div>
                    <div>
                      <StatusBadge status={status} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: o.table ? C.ink : '#c0ab8c' }}>
                      {o.table || '—'}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>
                        {o.customerName}
                      </div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: '#a0876a' }}>{o.phone}</div>
                    </div>
                    <div style={{ fontSize: 13, color: C.brown, lineHeight: 1.4 }}>{summariseItems(o)}</div>
                    <div className="text-right tabular-nums" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>
                      {o.quantity}
                    </div>
                    <div
                      className="text-right tabular-nums"
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontSize: 16,
                        color: cancelled ? '#c0ab8c' : C.ink,
                        textDecoration: cancelled ? 'line-through' : 'none',
                      }}
                    >
                      {formatCurrency(o.total)}
                    </div>
                    <div style={{ fontSize: 13, color: C.brown, fontWeight: 600 }}>{o.paymentMode}</div>
                    <div className="flex justify-end gap-1.5">
                      {active ? (
                        <>
                          <RowAction tone="green" onClick={() => onComplete(o)} disabled={completingId === o.id}>
                            {completingId === o.id ? '…' : 'Complete'}
                          </RowAction>
                          <RowAction tone="neutral" onClick={() => onModify?.(o)}>
                            Modify
                          </RowAction>
                          <RowAction tone="red" onClick={() => onCancel(o)} disabled={cancellingId === o.id}>
                            {cancellingId === o.id ? '…' : 'Cancel'}
                          </RowAction>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: '#c0ab8c' }}>—</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

function RowAction({ tone, onClick, disabled, children }) {
  const tones = {
    green: { color: C.green, border: '#bfe0bf' },
    red: { color: C.red, border: '#e9c3ba' },
    neutral: { color: C.ink, border: C.border2 },
  }
  const t = tones[tone] ?? tones.neutral
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="whitespace-nowrap rounded-lg px-2.5 py-1.5 font-bold transition-colors disabled:opacity-50"
      style={{ border: `1.5px solid ${t.border}`, background: '#fff', color: t.color, fontSize: 12 }}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }) {
  const styles = {
    completed: { background: '#e2f1e0', color: '#39833f' },
    cancelled: { background: '#f7e2dd', color: C.red },
    active: { background: C.goldBg, color: '#b06514' },
  }
  const label = { completed: 'Completed', cancelled: 'Cancelled', active: 'Active' }
  const key = status === 'completed' || status === 'cancelled' ? status : 'active'
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-3 py-[5px] capitalize"
      style={{ ...styles[key], fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em' }}
    >
      {label[key]}
    </span>
  )
}

/* -------------------------------- dialog -------------------------------- */

function AdminConfirmModal({ order, tone, busy, onCancel, onConfirm }) {
  const reduce = useReducedMotion()
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!order) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    confirmRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [order, busy, onCancel])

  const complete = tone === 'complete'
  const accent = complete ? C.green : C.red
  const accentBg = complete ? '#e2f1e0' : '#f7e2dd'

  return (
    <AnimatePresence>
      {order && (
        <>
          <motion.div
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(35,22,16,0.5)' }}
            onClick={busy ? undefined : onCancel}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-40px)] max-w-md overflow-hidden rounded-[20px]"
            style={{ background: C.cream, color: C.ink, x: '-50%', y: '-50%', boxShadow: '0 30px 70px rgba(0,0,0,0.35)' }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30 }}
          >
            <div className="px-6 pb-5 pt-6" style={{ background: `linear-gradient(${accentBg}, ${C.cream})` }}>
              <div
                className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                style={{ background: '#fff', color: accent, border: `1px solid ${accentBg}` }}
              >
                {complete ? '✓' : '⚠'}
              </div>
              <h2 id="admin-confirm-title" style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 23, margin: 0 }}>
                {complete ? 'Complete this order?' : 'Cancel this order?'}
              </h2>
              <p className="mt-1.5" style={{ fontSize: 14, color: C.brown }}>
                {complete ? 'Mark ' : 'Void '}
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.red }}>
                  {order.orderCode || 'this order'}
                </span>
                {complete
                  ? ' as done. This cannot be undone from admin.'
                  : '. It stays in records marked Cancelled and cannot be reopened.'}
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3" style={{ fontSize: 14 }}>
                <Detail label="Customer" value={order.customerName} />
                {complete && <Detail label="Phone" value={order.phone} mono />}
                {order.table && <Detail label="Table" value={order.table} />}
                {complete && <Detail label="Payment" value={order.paymentMode || '—'} />}
                <div className="col-span-2">
                  <dt style={{ color: C.brown2 }}>Items</dt>
                  <dd style={{ fontWeight: 600 }}>{summariseItems(order)}</dd>
                </div>
              </dl>

              {complete && (
                <div
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: C.goldBg, border: `1px solid ${C.goldBorder}` }}
                >
                  <span style={{ fontSize: 14, color: C.brown }}>Amount collected</span>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: C.red }}>
                    {formatCurrency(order.total)}
                  </span>
                </div>
              )}

              {order.table && (
                <div
                  className="flex gap-3 rounded-xl px-4 py-3"
                  style={{ background: accentBg, fontSize: 13.5, color: C.brown }}
                >
                  <span aria-hidden="true">🪑</span>
                  <p style={{ margin: 0 }}>
                    <b style={{ color: C.ink }}>{order.table}</b> will be freed for the next guest.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 px-6 pb-6 pt-1">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-xl px-5 py-3 font-bold disabled:opacity-50"
                style={{ border: `1.5px solid ${C.border2}`, background: '#fff', color: C.ink, fontSize: 14 }}
              >
                {complete ? 'Cancel' : 'Keep order'}
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="rounded-xl px-5 py-3 font-bold text-white disabled:opacity-60"
                style={{ background: accent, fontSize: 14 }}
              >
                {busy
                  ? complete
                    ? 'Completing…'
                    : 'Cancelling…'
                  : complete
                    ? 'Complete Order'
                    : 'Cancel order'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <dt style={{ color: C.brown2 }}>{label}</dt>
      <dd style={{ fontWeight: 600, fontFamily: mono ? FONT_MONO : 'inherit' }}>{value}</dd>
    </div>
  )
}

/* -------------------------------- helpers ------------------------------- */

function normStatus(status) {
  return status === 'completed' || status === 'cancelled' ? status : 'active'
}

function isToday(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return false
  return d.toDateString() === new Date().toDateString()
}

/** Short human summary of an order's pizzas, defensive against partial records. */
function summariseItems(o) {
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items
      .map((it) => {
        const name = it.pizza?.name ?? '—'
        return it.quantity > 1 ? `${name} ×${it.quantity}` : name
      })
      .join(', ')
  }
  const parts = []
  if (o.base?.name) parts.push(o.base.name)
  if (o.pizza?.name) parts.push(o.pizza.name)
  return parts.join(' · ') || '—'
}
