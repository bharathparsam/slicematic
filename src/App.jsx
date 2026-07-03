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
import { saveOrder } from '@/lib/orderStore'

export default function App() {
  const [view, setView] = useState('order') // 'order' | 'admin'
  return (
    <div className="min-h-screen">
      <Header view={view} setView={setView} />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        {view === 'order' ? <OrderFlow /> : <AdminOrdersTable />}
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

function OrderFlow() {
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

  // --- Stage: pick a table, then order --------------------------------
  const [stage, setStage] = useState('table') // 'table' | 'order'
  const [table, setTable] = useState('')

  // --- Customer state -------------------------------------------------
  const [customer, setCustomer] = useState({ name: '', phone: '' })
  const [custErrors, setCustErrors] = useState({ name: '', phone: '' })
  const [touched, setTouched] = useState({ name: false, phone: false })

  // --- Cart (multiple combos per order) -------------------------------
  const [cart, setCart] = useState([])
  const [cartError, setCartError] = useState('')
  const lineCounter = useRef(0)

  // --- Edit-in-place: a cart line pulled back into the builder ---------
  const [editingLineId, setEditingLineId] = useState('')
  const [editSeed, setEditSeed] = useState(null) // { nonce, pizzaId, baseId, toppingIds, quantity }
  const editNonce = useRef(0)

  // --- Payment / submit -----------------------------------------------
  const [payment, setPayment] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [confirmed, setConfirmed] = useState(null)
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
  // When we're editing a line, replace it in place (keeping its lineId); else append.
  function onAddCombo(combo) {
    if (editingLineId) {
      setCart((c) =>
        c.map((line) => (line.lineId === editingLineId ? { lineId: line.lineId, ...combo } : line))
      )
      setEditingLineId('')
      setEditSeed(null)
    } else {
      const lineId = `L${++lineCounter.current}`
      setCart((c) => [...c, { lineId, ...combo }])
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

    const order = {
      timestamp: new Date().toISOString(),
      sessionStartedAt: sessionStartedAt.current,
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

    const result = saveOrder(order)
    setSubmitting(false)
    submittingRef.current = false

    if (result.ok || result.reason === 'duplicate') {
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
    return <OrderConfirmed order={confirmed} onNew={startNewOrder} />
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

      <MenuSelector
        menu={menu}
        taxConfig={taxConfig}
        onAddCombo={onAddCombo}
        editSeed={editSeed}
        editingPizzaId={editSeed?.pizzaId ?? ''}
        onCancelEdit={cancelEdit}
      />

      <OrderSummary
        order={orderBill}
        taxConfig={taxConfig}
        onUpdateQty={updateLineQty}
        onRemove={removeLine}
        onEdit={editLine}
        editingLineId={editingLineId}
        error={cartError}
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
                ? `Confirm order · ${formatCurrency(orderBill.total)}`
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

function OrderConfirmed({ order, onNew }) {
  const itemCount = order.itemCount ?? order.items?.length ?? 0
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
          <CardTitle>Order confirmed</CardTitle>
          <CardDescription>
            {order.table ? `${order.table} · ` : ''}
            {order.customerName} · {order.paymentMode}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
          <Button className="w-full" onClick={onNew}>
            New order
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
