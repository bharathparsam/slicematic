import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Table, THead, TH, TR, TD, Button } from '@/components/ui/primitives'
import AdminAnalytics from '@/components/AdminAnalytics'
import { getAllOrders, completeOrder, cancelOrder } from '@/lib/orderStore'
import { formatCurrency } from '@/lib/billing'

const PLACEHOLDER_PASSWORD = 'slice123'
const SECTIONS = [
  { id: 'orders', label: 'Orders', icon: OrdersIcon },
  { id: 'analytics', label: 'Analytics', icon: AnalyticsIcon },
]

export default function AdminOrdersTable({ onModify, unlocked, onUnlock }) {
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

  if (!unlocked) {
    return (
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle>Admin access</CardTitle>
          <CardDescription>
            Placeholder gate — real auth comes with Supabase (Stage 3). Password:{' '}
            <code className="rounded bg-muted px-1">slice123</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={tryUnlock} className="space-y-3">
            <label htmlFor="admin-pw" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="admin-pw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              aria-invalid={!!pwError}
              aria-describedby={pwError ? 'admin-pw-error' : undefined}
              className="h-11 w-full rounded-md border border-input bg-background px-3"
            />
            {pwError && (
              <p id="admin-pw-error" role="alert" className="text-sm text-destructive">
                {pwError}
              </p>
            )}
            <Button type="submit" className="w-full">
              Unlock
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  const activeCount = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length

  return (
    <>
      <CompleteOrderDialog
        order={confirmOrder}
        busy={!!completingId}
        onCancel={closeCompleteDialog}
        onConfirm={confirmComplete}
      />

      <CancelOrderDialog
        order={cancelTarget}
        busy={!!cancellingId}
        onCancel={closeCancelDialog}
        onConfirm={confirmCancel}
      />

      <div className="flex min-h-[70vh] w-full flex-col gap-4 sm:flex-row sm:items-start">
        <aside className="w-full shrink-0 sm:w-48">
          <nav
            aria-label="Admin sections"
            className="flex flex-row gap-1 rounded-lg border border-border bg-background p-1 sm:flex-col"
          >
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const active = section === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'flex flex-1 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-semibold transition-colors sm:flex-none ' +
                    (active
                      ? 'bg-brand text-brand-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {section === 'analytics' ? (
            <AdminAnalytics />
          ) : (
            <OrdersPanel
              orders={orders}
              loading={loading}
              loadError={loadError}
              activeCount={activeCount}
              completingId={completingId}
              cancellingId={cancellingId}
              onRefresh={refresh}
              onComplete={openCompleteDialog}
              onModify={onModify}
              onCancel={openCancelDialog}
            />
          )}
        </div>
      </div>
    </>
  )
}

function OrdersPanel({
  orders,
  loading,
  loadError,
  activeCount,
  completingId,
  cancellingId,
  onRefresh,
  onComplete,
  onModify,
  onCancel,
}) {
  return (
      <Card className="w-full min-w-0 flex-1">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>All orders ({orders.length})</CardTitle>
          <CardDescription>
            Loaded from the API · most recent first
            {activeCount > 0 && ` · ${activeCount} active`}
          </CardDescription>
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        {loadError && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {loadError}
          </p>
        )}
        {loading && orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No orders yet. Place one from the Order tab.
          </p>
        ) : (
          <Table className="table-fixed">
            <colgroup>
              <col className="w-[7rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[5rem]" />
              <col className="w-[10rem]" />
              <col />
              <col className="w-[3rem]" />
              <col className="w-[6rem]" />
              <col className="w-[5rem]" />
              <col className="w-[9rem]" />
              <col className="w-[9.5rem]" />
            </colgroup>
            <THead>
              <TR>
                <TH>Order ID</TH>
                <TH>Status</TH>
                <TH>Table</TH>
                <TH>Customer</TH>
                <TH>Items</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Total</TH>
                <TH>Payment</TH>
                <TH>Time</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {orders.map((o) => {
                const cancelled = o.status === 'cancelled'
                const completed = o.status === 'completed'
                const active = !cancelled && !completed
                return (
                  <TR key={o.id} className={active ? '' : 'opacity-60'}>
                    <TD className="align-middle whitespace-nowrap font-mono text-xs font-semibold text-brand-dark">
                      {o.orderCode || '—'}
                    </TD>
                    <TD className="align-middle">
                      <StatusBadge status={o.status} />
                    </TD>
                    <TD className="align-middle whitespace-nowrap font-medium">
                      {o.table || '—'}
                    </TD>
                    <TD className="align-middle">
                      <div className="font-medium">{o.customerName}</div>
                      <div className="text-xs text-muted-foreground">{o.phone}</div>
                    </TD>
                    <TD className="align-middle text-muted-foreground">
                      {summariseItems(o)}
                    </TD>
                    <TD className="align-middle text-right tabular-nums">{o.quantity}</TD>
                    <TD
                      className={
                        'align-middle text-right font-semibold tabular-nums ' +
                        (cancelled ? 'line-through' : '')
                      }
                    >
                      {formatCurrency(o.total)}
                    </TD>
                    <TD className="align-middle whitespace-nowrap">{o.paymentMode}</TD>
                    <TD className="align-middle whitespace-nowrap text-xs text-muted-foreground">
                      {formatTime(o.timestamp)}
                    </TD>
                    <TD className="align-middle">
                      {active ? (
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => onComplete(o)}
                            disabled={completingId === o.id}
                            className="whitespace-nowrap rounded-md border border-green-200 bg-background px-2 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
                          >
                            {completingId === o.id ? 'Completing…' : 'Complete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onModify?.(o)}
                            className="whitespace-nowrap rounded-md border border-input bg-background px-2 py-1.5 text-xs font-semibold text-brand-dark transition-colors hover:bg-brand/10"
                          >
                            Modify
                          </button>
                          <button
                            type="button"
                            onClick={() => onCancel(o)}
                            disabled={cancellingId === o.id}
                            className="whitespace-nowrap rounded-md border border-destructive/30 bg-background px-2 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                          >
                            {cancellingId === o.id ? 'Cancelling…' : 'Cancel'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function OrdersIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function AnalyticsIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 19V5M9 19V9M14 19v-6M19 19V3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Styled confirmation dialog — replaces the browser confirm for completing orders. */
function CompleteOrderDialog({ order, busy, onCancel, onConfirm }) {
  const reduceMotion = useReducedMotion()
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

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 420, damping: 32 }

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={busy ? undefined : onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-order-title"
            aria-describedby="complete-order-desc"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={spring}
          >
            <div className="border-b border-border bg-gradient-to-br from-green-50 to-background px-6 pb-5 pt-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl shadow-inner">
                ✓
              </div>
              <h2 id="complete-order-title" className="text-xl font-bold tracking-tight">
                Complete this order?
              </h2>
              <p id="complete-order-desc" className="mt-1.5 text-sm text-muted-foreground">
                Mark{' '}
                <span className="font-mono font-semibold text-brand-dark">
                  {order.orderCode || 'this order'}
                </span>{' '}
                as done. This action cannot be undone from admin.
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Customer</dt>
                  <dd className="font-medium">{order.customerName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium tabular-nums">{order.phone}</dd>
                </div>
                {order.table && (
                  <div>
                    <dt className="text-muted-foreground">Table</dt>
                    <dd className="font-medium">{order.table}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Payment</dt>
                  <dd className="font-medium">{order.paymentMode || '—'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Items</dt>
                  <dd className="font-medium">{summariseItems(order)}</dd>
                </div>
              </dl>

              <div className="flex items-center justify-between rounded-lg border border-brand/20 bg-brand/5 px-4 py-3">
                <span className="text-sm text-muted-foreground">Amount collected</span>
                <span className="text-lg font-extrabold text-brand-dark">
                  {formatCurrency(order.total)}
                </span>
              </div>

              {order.table && (
                <div className="flex gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  <span aria-hidden="true">🪑</span>
                  <p>
                    <span className="font-semibold">{order.table}</span> will be freed and available
                    for the next guest.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="sm:min-w-[7rem]"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </Button>
              <button
                ref={confirmRef}
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center justify-center rounded-md border border-green-300 bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 sm:min-w-[9rem]"
              >
                {busy ? 'Completing…' : 'Complete Order'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Confirmation dialog for cancelling (voiding) an order. */
function CancelOrderDialog({ order, busy, onCancel, onConfirm }) {
  const reduceMotion = useReducedMotion()
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

  const spring = reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={busy ? undefined : onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={spring}
          >
            <div className="border-b border-border bg-gradient-to-br from-red-50 to-background px-6 pb-5 pt-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-2xl text-destructive shadow-inner">
                ⚠
              </div>
              <h2 id="cancel-order-title" className="text-xl font-bold tracking-tight">
                Cancel this order?
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Void{' '}
                <span className="font-mono font-semibold text-brand-dark">
                  {order.orderCode || 'this order'}
                </span>
                . It stays in records marked <span className="font-semibold">Cancelled</span> and
                cannot be reopened.
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Customer</dt>
                  <dd className="font-medium">{order.customerName}</dd>
                </div>
                {order.table && (
                  <div>
                    <dt className="text-muted-foreground">Table</dt>
                    <dd className="font-medium">{order.table}</dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Items</dt>
                  <dd className="font-medium">{summariseItems(order)}</dd>
                </div>
              </dl>
              {order.table && (
                <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <span aria-hidden="true">🪑</span>
                  <p>
                    <span className="font-semibold">{order.table}</span> will be freed for the next
                    guest.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
              <Button variant="outline" className="sm:min-w-[7rem]" onClick={onCancel} disabled={busy}>
                Keep order
              </Button>
              <button
                ref={confirmRef}
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-50 sm:min-w-[9rem]"
              >
                {busy ? 'Cancelling…' : 'Cancel order'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Small status pill: Active (open, occupies its table), Completed or Cancelled. */
function StatusBadge({ status }) {
  const styles = {
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-destructive/10 text-destructive',
    active: 'bg-brand/10 text-brand-dark',
  }
  const label = { completed: 'Completed', cancelled: 'Cancelled', active: 'Active' }
  const key = status === 'completed' || status === 'cancelled' ? status : 'active'
  return (
    <span
      className={
        'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ' +
        styles[key]
      }
    >
      {label[key]}
    </span>
  )
}

/** Short human summary of an order's pizzas, defensive against partial records. */
function summariseItems(o) {
  // Current model: an order has an `items` array of combos.
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items
      .map((it) => {
        const name = it.pizza?.name ?? '—'
        return it.quantity > 1 ? `${name} ×${it.quantity}` : name
      })
      .join(', ')
  }
  // Backward-compat: older single-combo records.
  const parts = []
  if (o.base?.name) parts.push(o.base.name)
  if (o.pizza?.name) parts.push(o.pizza.name)
  return parts.join(' · ') || '—'
}

function formatTime(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
