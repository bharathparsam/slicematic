import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { kitchenProgressLabel } from '@/lib/analyticsFormat'
import { getAllOrders, completeOrder, cancelOrder } from '@/lib/orderStore'
import { normOrderStatus, summariseOrderItems } from '@/lib/orderDisplay'
import { formatCurrency } from '@/lib/billing'
import { C, FONT_DISPLAY, FONT_MONO } from '@/components/order/theme'
import PizzaLoader from '@/components/order/PizzaLoader'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

const GRID = '96px 100px 72px 1.3fr 1.8fr 48px 108px 66px 168px'

export default function ManagerOrdersPanel() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [completingId, setCompletingId] = useState('')
  const [confirmOrder, setConfirmOrder] = useState(null)
  const [cancellingId, setCancellingId] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [filter, setFilter] = useState('active')

  useEffect(() => {
    refresh()
  }, [])

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

  const activeCount = orders.filter((o) => normOrderStatus(o.status) === 'active').length
  const filtered = filter === 'all' ? orders : orders.filter((o) => normOrderStatus(o.status) === filter)

  return (
    <>
      <OrderConfirmModal
        order={confirmOrder}
        tone="complete"
        busy={!!completingId}
        onCancel={() => !completingId && setConfirmOrder(null)}
        onConfirm={confirmComplete}
      />
      <OrderConfirmModal
        order={cancelTarget}
        tone="cancel"
        busy={!!cancellingId}
        onCancel={() => !cancellingId && setCancelTarget(null)}
        onConfirm={confirmCancel}
      />

      <div className="px-4 py-6 sm:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 30, margin: 0, color: C.ink }}>
              Order list
            </h1>
            <div className="mt-1.5" style={{ fontSize: 13.5, color: C.brown2, fontWeight: 600 }}>
              Complete or cancel to free tables ·{' '}
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
              onClick={refresh}
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
            <div style={{ minWidth: 980 }}>
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
                <PizzaLoader variant="inline" />
              ) : filtered.length === 0 ? (
                <p className="py-10 text-center" style={{ fontSize: 14, color: C.brown2 }}>
                  {orders.length === 0 ? 'No orders yet.' : 'No orders match this filter.'}
                </p>
              ) : (
                filtered.map((o) => {
                  const status = normOrderStatus(o.status)
                  const cancelled = status === 'cancelled'
                  const active = status === 'active'
                  return (
                    <div
                      key={o.id}
                      className="grid items-center gap-3.5 px-6 py-4 transition-colors"
                      style={{ gridTemplateColumns: GRID, borderBottom: '1px solid #f6ecda' }}
                    >
                      <div style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 13, color: C.red }}>
                        {o.orderCode || '—'}
                      </div>
                      <div>
                        <StatusBadge status={status} />
                        {active && (
                          <div style={{ fontSize: 11, color: C.brown2, fontWeight: 600, marginTop: 4 }}>
                            {kitchenProgressLabel(o.items) || 'Queued'}
                          </div>
                        )}
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
                      <div style={{ fontSize: 13, color: C.brown, lineHeight: 1.4 }}>{summariseOrderItems(o)}</div>
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
                      <div className="flex flex-nowrap justify-end gap-1.5">
                        {active ? (
                          <>
                            <RowAction
                              tone="green"
                              onClick={() => {
                                setLoadError('')
                                setConfirmOrder(o)
                              }}
                              disabled={completingId === o.id}
                            >
                              {completingId === o.id ? '…' : 'Complete'}
                            </RowAction>
                            <RowAction
                              tone="red"
                              onClick={() => {
                                setLoadError('')
                                setCancelTarget(o)
                              }}
                              disabled={cancellingId === o.id}
                            >
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
      </div>
    </>
  )
}

function RowAction({ tone, onClick, disabled, children }) {
  const tones = {
    green: { color: C.green, border: '#bfe0bf' },
    red: { color: C.red, border: '#e9c3ba' },
  }
  const t = tones[tone] ?? tones.green
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-bold transition-colors disabled:opacity-50"
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

function OrderConfirmModal({ order, tone, busy, onCancel, onConfirm }) {
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
            aria-labelledby="manager-confirm-title"
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
              <h2 id="manager-confirm-title" style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 23, margin: 0 }}>
                {complete ? 'Complete this order?' : 'Cancel this order?'}
              </h2>
              <p className="mt-1.5" style={{ fontSize: 14, color: C.brown }}>
                {complete ? 'Mark ' : 'Void '}
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.red }}>
                  {order.orderCode || 'this order'}
                </span>
                {complete
                  ? ' as done. This frees the table for the next guest.'
                  : '. It stays in records marked Cancelled and cannot be reopened.'}
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3" style={{ fontSize: 14 }}>
                <div>
                  <dt style={{ color: C.brown2 }}>Customer</dt>
                  <dd style={{ fontWeight: 600 }}>{order.customerName}</dd>
                </div>
                {order.table && (
                  <div>
                    <dt style={{ color: C.brown2 }}>Table</dt>
                    <dd style={{ fontWeight: 600 }}>{order.table}</dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt style={{ color: C.brown2 }}>Items</dt>
                  <dd style={{ fontWeight: 600 }}>{summariseOrderItems(order)}</dd>
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
            </div>

            <div className="flex justify-end gap-2.5 px-6 pb-6 pt-1">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-xl px-5 py-3 font-bold disabled:opacity-50"
                style={{ border: `1.5px solid ${C.border2}`, background: '#fff', color: C.ink, fontSize: 14 }}
              >
                {complete ? 'Back' : 'Keep order'}
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="rounded-xl px-5 py-3 font-bold text-white disabled:opacity-60"
                style={{ background: accent, fontSize: 14 }}
              >
                {busy ? (complete ? 'Completing…' : 'Cancelling…') : complete ? 'Complete order' : 'Cancel order'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
