import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Table, THead, TH, TR, TD, Button } from '@/components/ui/primitives'
import { getAllOrders, clearOrders } from '@/lib/orderStore'
import { formatCurrency } from '@/lib/billing'

/**
 * Step 6 — Admin view. Placeholder access only: a client-side password gate,
 * NOT real auth (real auth arrives with Supabase Auth in Stage 3). Lists all
 * orders, most recent first.
 */
const PLACEHOLDER_PASSWORD = 'slice123'

export default function AdminOrdersTable() {
  const [unlocked, setUnlocked] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [orders, setOrders] = useState([])

  useEffect(() => {
    if (unlocked) setOrders(getAllOrders())
  }, [unlocked])

  function tryUnlock(e) {
    e.preventDefault()
    if (pw === PLACEHOLDER_PASSWORD) {
      setUnlocked(true)
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
          <CardDescription>Most recent first.</CardDescription>
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
                <TH>Customer</TH>
                <TH>Items</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Total</TH>
                <TH>Payment</TH>
                <TH>Time</TH>
              </TR>
            </THead>
            <tbody>
              {orders.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <div className="font-medium">{o.customerName}</div>
                    <div className="text-xs text-muted-foreground">{o.phone}</div>
                  </TD>
                  <TD className="max-w-[280px] text-muted-foreground">
                    {summariseItems(o)}
                  </TD>
                  <TD className="text-right tabular-nums">{o.quantity}</TD>
                  <TD className="text-right font-semibold tabular-nums">
                    {formatCurrency(o.total)}
                  </TD>
                  <TD>{o.paymentMode}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatTime(o.timestamp)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/** Short human summary of the combo, defensive against older/partial records. */
function summariseItems(o) {
  const parts = []
  if (o.base?.name) parts.push(o.base.name)
  if (o.pizza?.name) parts.push(o.pizza.name)
  const base = parts.join(' · ')
  const toppings = Array.isArray(o.toppings) ? o.toppings : []
  const tops =
    toppings.length > 0 ? ` + ${toppings.map((t) => t.name).join(', ')}` : ''
  return base + tops || '—'
}

function formatTime(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
