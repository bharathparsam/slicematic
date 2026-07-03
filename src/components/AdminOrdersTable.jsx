import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Table, THead, TH, TR, TD, Button } from '@/components/ui/primitives'
import { getAllOrders, clearOrders, cancelOrder, completeOrder } from '@/lib/orderStore'
import { formatCurrency } from '@/lib/billing'

/**
 * Step 6 — Admin view. Placeholder access only: a client-side password gate,
 * NOT real auth (real auth arrives with Supabase Auth in Stage 3). Lists all
 * orders, most recent first, with per-order Modify (full edit, handled up in
 * App), Complete (frees the table) and soft-Cancel actions.
 */
const PLACEHOLDER_PASSWORD = 'slice123'

export default function AdminOrdersTable({ onModify, unlocked, onUnlock }) {
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [orders, setOrders] = useState([])

  // Unlock state is owned by App so it survives the Modify round-trip (this
  // component unmounts while the order is edited in the Order view).
  useEffect(() => {
    if (unlocked) setOrders(getAllOrders())
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

  function refresh() {
    setOrders(getAllOrders())
  }

  function handleClear() {
    if (window.confirm('Delete ALL saved orders? This cannot be undone.')) {
      clearOrders()
      refresh()
    }
  }

  function handleCancel(o) {
    const label = o.orderCode ? `order ${o.orderCode}` : 'this order'
    if (window.confirm(`Cancel ${label}? It stays in records, marked Cancelled.`)) {
      cancelOrder(o.id)
      refresh()
    }
  }

  function handleComplete(o) {
    // Completing frees the table for new orders.
    completeOrder(o.id)
    refresh()
  }

  const cancelledCount = orders.filter((o) => o.status === 'cancelled').length
  const completedCount = orders.filter((o) => o.status === 'completed').length

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

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>All orders ({orders.length})</CardTitle>
          <CardDescription>
            Most recent first.
            {completedCount > 0 && ` · ${completedCount} completed`}
            {cancelledCount > 0 && ` · ${cancelledCount} cancelled`}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            Refresh
          </Button>
          <Button
            variant="destructive"
            onClick={handleClear}
            disabled={orders.length === 0}
          >
            Clear all
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No orders yet. Place one from the Order tab.
          </p>
        ) : (
          <Table>
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
                    <TD className="whitespace-nowrap font-mono text-xs font-semibold text-brand-dark">
                      {o.orderCode || '—'}
                    </TD>
                    <TD>
                      <StatusBadge status={o.status} />
                    </TD>
                    <TD className="whitespace-nowrap font-medium">{o.table || '—'}</TD>
                    <TD>
                      <div className="font-medium">{o.customerName}</div>
                      <div className="text-xs text-muted-foreground">{o.phone}</div>
                    </TD>
                    <TD className="max-w-[280px] text-muted-foreground">
                      {summariseItems(o)}
                    </TD>
                    <TD className="text-right tabular-nums">{o.quantity}</TD>
                    <TD
                      className={
                        'text-right font-semibold tabular-nums ' +
                        (cancelled ? 'line-through' : '')
                      }
                    >
                      {formatCurrency(o.total)}
                    </TD>
                    <TD>{o.paymentMode}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatTime(o.timestamp)}
                      {o.updatedAt && <div className="text-[10px]">edited</div>}
                    </TD>
                    <TD className="text-right">
                      {active ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleComplete(o)}
                            className="rounded px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            onClick={() => onModify?.(o)}
                            className="rounded px-2 py-1 text-xs font-semibold text-brand-dark hover:bg-brand/10"
                          >
                            Modify
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancel(o)}
                            className="rounded px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                          >
                            Cancel
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
