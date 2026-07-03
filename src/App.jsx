import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TableSelect from '@/components/TableSelect'
import CustomerIntakeForm from '@/components/CustomerIntakeForm'
import MenuSelector from '@/components/MenuSelector'
import OrderSummary from '@/components/OrderSummary'
import PaymentSelector from '@/components/PaymentSelector'
import AdminOrdersTable from '@/components/AdminOrdersTable'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from '@/components/ui/primitives'
import { loadAllMenus } from '@/lib/menuLoader'
import { loadTaxConfig, DEFAULT_TAX_CONFIG } from '@/lib/taxConfig'
import { loadTables, DEFAULT_TABLES } from '@/lib/tablesLoader'
import { validateName, validatePhone } from '@/lib/validators'
import { computeOrderBill, formatCurrency } from '@/lib/billing'
import { saveOrder, updateOrder } from '@/lib/orderStore'

export default function App() {
  const [view, setView] = useState('order') // 'order' | 'admin'
  // A saved order pulled in from Admin for full editing (null = new order).
  const [editingOrder, setEditingOrder] = useState(null)
  // Admin unlock lives here so it survives the Modify round-trip (Admin unmounts
  // while an order is edited in the Order view).
  const [adminUnlocked, setAdminUnlocked] = useState(false)

  function goToView(next) {
    setEditingOrder(null) // switching tabs abandons any in-progress modify
    setView(next)
  }
  function startModify(order) {
    setEditingOrder(order)
    setView('order')
  }
  function doneEditing() {
    setEditingOrder(null)
    setView('admin')
  }

  return (
    <div className="min-h-screen">
      <Header view={view} setView={goToView} />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        {view === 'order' ? (
          <OrderFlow
            key={editingOrder ? editingOrder.id : 'new'}
            editingOrder={editingOrder}
            onDoneEditing={doneEditing}
          />
        ) : (
          <AdminOrdersTable
            onModify={startModify}
            unlocked={adminUnlocked}
            onUnlock={() => setAdminUnlocked(true)}
          />
        )}
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground">
        SliceMatic MVP · local-only (localStorage) · Delhi
      </footer>
    </div>
  )
}

function Header({ view, setView }) {
  const tabs = [
    { id: 'order', label: 'Order' },
    { id: 'admin', label: 'Admin' },
  ]
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">🍕</span>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">SliceMatic</h1>
            <p className="text-xs text-muted-foreground">Order desk</p>
          </div>
        </div>
        <nav aria-label="Views" className="flex gap-1 rounded-lg bg-muted p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              aria-current={view === t.id ? 'page' : undefined}
              className={
                'rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ' +
                (view === t.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}

/**
 * Two cart entries are the "same combination" when base, pizza and the SET of
 * toppings all match (topping order doesn't matter). Used to merge a repeat add
 * into the existing line instead of creating a duplicate.
 */
function sameCombination(line, combo) {
  if (line.base?.id !== combo.base?.id) return false
  if (line.pizza?.id !== combo.pizza?.id) return false
  const a = line.toppings.map((t) => t.id).sort()
  const b = combo.toppings.map((t) => t.id).sort()
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/** Rebuild editable cart lines from a saved order record's items[]. */
function seedCartFromOrder(order) {
  return (order?.items ?? []).map((it, i) => ({
    lineId: `L${i + 1}`,
    base: { ...it.base },
    pizza: { ...it.pizza },
    toppings: (it.toppings ?? []).map((t) => ({ ...t })),
    quantity: it.quantity,
  }))
}

function OrderFlow({ editingOrder = null, onDoneEditing }) {
  const isEditing = !!editingOrder

  // --- Load state (menu required; tax + tables self-default) ----------
  const [menu, setMenu] = useState(null)
  const [taxConfig, setTaxConfig] = useState(DEFAULT_TAX_CONFIG)
  const [tables, setTables] = useState(DEFAULT_TABLES.tables)
  const [tableLabel, setTableLabel] = useState(DEFAULT_TABLES.label)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  // Session timestamp captured when the flow starts.
  const sessionStartedAt = useRef(new Date().toISOString())

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      // Menu must load; tax config + tables self-default if their files are bad.
      const [data, cfg, tbl] = await Promise.all([loadAllMenus(), loadTaxConfig(), loadTables()])
      setMenu(data)
      setTaxConfig(cfg)
      setTables(tbl.tables)
      setTableLabel(tbl.label)
    } catch (err) {
      setMenu(null)
      setLoadError(err.message || 'Failed to load menu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Stage: pick a table, then order (editing skips table select) ---
  const [stage, setStage] = useState(isEditing ? 'order' : 'table') // 'table' | 'order'
  const [table, setTable] = useState(editingOrder?.table ?? '')

  // --- Customer state (seeded from the order being edited) ------------
  const [customer, setCustomer] = useState({
    name: editingOrder?.customerName ?? '',
    phone: editingOrder?.phone ?? '',
  })
  const [custErrors, setCustErrors] = useState({ name: '', phone: '' })
  const [touched, setTouched] = useState({ name: false, phone: false })

  // --- Cart (multiple combos per order) -------------------------------
  const [cart, setCart] = useState(() => seedCartFromOrder(editingOrder))
  const [cartError, setCartError] = useState('')
  const lineCounter = useRef(editingOrder?.items?.length ?? 0)

  // --- Edit-in-place: a cart line pulled back into the builder ---------
  const [editingLineId, setEditingLineId] = useState('')
  const [editSeed, setEditSeed] = useState(null) // { nonce, pizzaId, baseId, toppingIds, quantity }
  const editNonce = useRef(0)

  // --- Payment / submit -----------------------------------------------
  const [payment, setPayment] = useState(editingOrder?.paymentMode ?? '')
  const [paymentError, setPaymentError] = useState('')
  const [confirmed, setConfirmed] = useState(null)
  const [confirmedMode, setConfirmedMode] = useState('created') // 'created' | 'updated'
  const submittingRef = useRef(false) // synchronous guard vs double-click
  const [submitting, setSubmitting] = useState(false)

  // Aggregate bill for everything in the cart.
  const orderBill = useMemo(() => computeOrderBill(cart, taxConfig), [cart, taxConfig])

  // --- Customer handlers ----------------------------------------------
  function onCustChange(field, value) {
    setCustomer((c) => ({ ...c, [field]: value }))
    if (touched[field]) {
      const check = field === 'name' ? validateName(value) : validatePhone(value)
      setCustErrors((e) => ({ ...e, [field]: check.error }))
    }
  }
  function onCustBlur(field) {
    setTouched((t) => ({ ...t, [field]: true }))
    const check =
      field === 'name' ? validateName(customer.name) : validatePhone(customer.phone)
    setCustErrors((e) => ({ ...e, [field]: check.error }))
  }

  // --- Cart handlers --------------------------------------------------
  // A completed combo arrives from the pizza builder: { base, pizza, toppings, quantity }.
  // When editing a line, replace it in place (keeping its lineId). Otherwise, if
  // the exact same base+pizza+toppings is already in the cart, bump that line's
  // quantity (capped at 10) instead of adding a duplicate; else append a new line.
  function onAddCombo(combo) {
    if (editingLineId) {
      setCart((c) =>
        c.map((line) => (line.lineId === editingLineId ? { lineId: line.lineId, ...combo } : line))
      )
      setEditingLineId('')
      setEditSeed(null)
    } else {
      const lineId = `L${++lineCounter.current}`
      setCart((c) => {
        const idx = c.findIndex((line) => sameCombination(line, combo))
        if (idx !== -1) {
          return c.map((line, i) =>
            i === idx
              ? { ...line, quantity: Math.min(10, line.quantity + combo.quantity) }
              : line
          )
        }
        return [...c, { lineId, ...combo }]
      })
    }
    setCartError('')
  }
  function updateLineQty(lineId, nextQty) {
    const clamped = Math.max(1, Math.min(10, nextQty))
    setCart((c) => c.map((line) => (line.lineId === lineId ? { ...line, quantity: clamped } : line)))
  }
  function removeLine(lineId) {
    setCart((c) => c.filter((line) => line.lineId !== lineId))
    if (lineId === editingLineId) cancelEdit() // dropping the line we were editing
  }

  // Pull a cart line back into the builder: open its pizza pre-filled + scroll.
  function editLine(lineId) {
    const line = cart.find((l) => l.lineId === lineId)
    if (!line) return
    setEditingLineId(lineId)
    setEditSeed({
      nonce: ++editNonce.current,
      pizzaId: line.pizza.id,
      baseId: line.base.id,
      toppingIds: line.toppings.map((t) => t.id),
      quantity: line.quantity,
    })
    setCartError('')
  }
  function cancelEdit() {
    setEditingLineId('')
    setEditSeed(null)
  }

  // --- Confirm --------------------------------------------------------
  function handleConfirm() {
    if (submittingRef.current) return // synchronous double-click guard

    const nameCheck = validateName(customer.name)
    const phoneCheck = validatePhone(customer.phone)
    const cartEmpty = cart.length === 0
    const payErr = payment ? '' : 'Please select a payment method.'

    setTouched({ name: true, phone: true })
    setCustErrors({ name: nameCheck.error, phone: phoneCheck.error })
    setPaymentError(payErr)
    if (cartEmpty) setCartError('Add at least one pizza to the order.')

    const ok = nameCheck.valid && phoneCheck.valid && !cartEmpty && !payErr
    if (!ok) {
      const focusId =
        (nameCheck.valid ? '' : 'cust-name') || (phoneCheck.valid ? '' : 'cust-phone')
      const el = focusId && document.getElementById(focusId)
      if (el?.focus) el.focus()
      return
    }

    submittingRef.current = true
    setSubmitting(true)

    // Recompute here so the saved record can never drift from the UI.
    const finalBill = computeOrderBill(cart, taxConfig)

    // The re-billed fields, shared by create and edit paths.
    const payload = {
      table: table || null,
      customerName: customer.name.trim(),
      phone: customer.phone.trim(),
      items: finalBill.lines.map((l) => ({
        base: { id: l.base.id, name: l.base.name, price: l.base.price },
        pizza: { id: l.pizza.id, name: l.pizza.name, price: l.pizza.price },
        toppings: l.toppings.map((t) => ({ id: t.id, name: t.name, price: t.price })),
        quantity: l.quantity,
        unitPrice: l.unit,
        lineSubtotal: l.subtotal,
        lineDiscount: l.discount,
        lineGst: l.gst,
        lineTotal: l.total,
      })),
      itemCount: finalBill.lines.length,
      quantity: finalBill.totalQuantity, // total pizzas across the order
      subtotal: finalBill.subtotal,
      discount: finalBill.discount,
      gst: finalBill.gst,
      cgst: finalBill.cgst,
      sgst: finalBill.sgst,
      gstRate: taxConfig.gst.rate, // snapshot the rate that was applied
      total: finalBill.total,
      paymentMode: payment,
    }

    // Edit: overwrite the existing record (updateOrder preserves id / orderCode /
    // orderNumber / timestamp / status). New: create with a fresh id + number.
    const result = isEditing
      ? updateOrder({ id: editingOrder.id, ...payload })
      : saveOrder({
          timestamp: new Date().toISOString(),
          sessionStartedAt: sessionStartedAt.current,
          ...payload,
        })

    setSubmitting(false)
    submittingRef.current = false

    if (result.ok || result.reason === 'duplicate') {
      setConfirmedMode(isEditing ? 'updated' : 'created')
      setConfirmed(result.order)
    } else {
      setPaymentError('Could not save the order. Please try again.')
    }
  }

  function startNewOrder() {
    setCustomer({ name: '', phone: '' })
    setCustErrors({ name: '', phone: '' })
    setTouched({ name: false, phone: false })
    setCart([])
    setCartError('')
    setEditingLineId('')
    setEditSeed(null)
    setPayment('')
    setPaymentError('')
    setConfirmed(null)
    setTable('')
    setStage('table')
    sessionStartedAt.current = new Date().toISOString()
  }

  // --- Render ---------------------------------------------------------
  if (loading) {
    return <StatusPanel title="Loading menu…" tone="muted" />
  }
  if (loadError) {
    return (
      <StatusPanel title="Menu failed to load" tone="error">
        <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-3 text-left text-xs text-foreground">
          {loadError}
        </pre>
        <Button className="mt-4" onClick={load}>
          Retry
        </Button>
      </StatusPanel>
    )
  }
  if (confirmed) {
    return (
      <OrderConfirmed
        order={confirmed}
        mode={confirmedMode}
        onNew={startNewOrder}
        onBackToAdmin={onDoneEditing}
      />
    )
  }

  // Table-selection landing screen.
  if (stage === 'table') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="table"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <TableSelect
            tables={tables}
            label={tableLabel}
            selected={table}
            onSelect={setTable}
            onStart={() => setStage('order')}
          />
        </motion.div>
      </AnimatePresence>
    )
  }

  // Order-building flow (mobile-first single column).
  return (
    <motion.div
      key="order"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="mx-auto max-w-md space-y-5"
    >
      {/* Edit banner — only when modifying an existing order from Admin */}
      {isEditing && (
        <div className="flex items-center justify-between rounded-lg border border-brand/40 bg-brand/10 px-4 py-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Modifying </span>
            <span className="font-mono font-bold text-brand-dark">{editingOrder.orderCode}</span>
          </p>
          <button
            type="button"
            onClick={onDoneEditing}
            className="rounded px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
          >
            Discard
          </button>
        </div>
      )}

      {/* Table banner + change */}
      <div className="flex items-center justify-between rounded-lg bg-brand/5 px-4 py-3">
        <p className="text-sm">
          <span className="text-muted-foreground">Ordering for </span>
          <span className="font-bold text-brand-dark">{table}</span>
        </p>
        <button
          type="button"
          onClick={() => setStage('table')}
          className="rounded px-2 py-1 text-xs font-semibold text-brand-dark hover:bg-brand/10"
        >
          Change
        </button>
      </div>

      <CustomerIntakeForm
        values={customer}
        errors={custErrors}
        onChange={onCustChange}
        onBlur={onCustBlur}
      />

      {/* Cart kept high up so its per-line Edit is reachable without scrolling
          past the whole menu (also carries the empty-cart confirm error). */}
      <OrderSummary
        order={orderBill}
        taxConfig={taxConfig}
        onUpdateQty={updateLineQty}
        onRemove={removeLine}
        onEdit={editLine}
        editingLineId={editingLineId}
        error={cartError}
      />

      <MenuSelector
        menu={menu}
        taxConfig={taxConfig}
        onAddCombo={onAddCombo}
        editSeed={editSeed}
        editingPizzaId={editSeed?.pizzaId ?? ''}
        onCancelEdit={cancelEdit}
      />

      <Card>
        <CardHeader>
          <CardTitle>Payment &amp; confirm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PaymentSelector
            value={payment}
            error={paymentError}
            onChange={(m) => {
              setPayment(m)
              setPaymentError('')
            }}
          />
          <Button
            className="w-full py-3.5 text-base"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting
              ? 'Saving…'
              : cart.length > 0
                ? `${isEditing ? 'Save changes' : 'Confirm order'} · ${formatCurrency(orderBill.total)}`
                : isEditing
                  ? 'Save changes'
                  : 'Confirm order'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function StatusPanel({ title, tone = 'muted', children }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p
        className={
          'text-lg font-semibold ' +
          (tone === 'error' ? 'text-destructive' : 'text-muted-foreground')
        }
      >
        {title}
      </p>
      {children}
    </div>
  )
}

function OrderConfirmed({ order, mode = 'created', onNew, onBackToAdmin }) {
  const itemCount = order.itemCount ?? order.items?.length ?? 0
  const updated = mode === 'updated'
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <motion.div
            className="mb-1 text-5xl"
            aria-hidden="true"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
          >
            ✅
          </motion.div>
          <CardTitle>{updated ? 'Order updated' : 'Order confirmed'}</CardTitle>
          <CardDescription>
            {order.table ? `${order.table} · ` : ''}
            {order.customerName} · {order.paymentMode}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.orderCode && (
            <div className="flex items-center justify-between rounded-md border border-brand/30 bg-brand/5 px-4 py-3">
              <span className="text-sm text-muted-foreground">Order ID</span>
              <span className="font-mono text-lg font-bold tracking-wide text-brand-dark">
                {order.orderCode}
              </span>
            </div>
          )}
          <div className="rounded-md bg-muted p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Amount paid</span>
              <span className="text-2xl font-extrabold text-brand-dark">
                {formatCurrency(order.total)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {itemCount} pizza type{itemCount === 1 ? '' : 's'} · {order.quantity}{' '}
              pizza{order.quantity === 1 ? '' : 's'} total
            </p>
          </div>
          <Button className="w-full" onClick={updated ? onBackToAdmin : onNew}>
            {updated ? 'Back to orders' : 'New order'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
