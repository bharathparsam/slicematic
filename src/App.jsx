import { useEffect, useMemo, useRef, useState } from 'react'
import CustomerIntakeForm from '@/components/CustomerIntakeForm'
import MenuSelector from '@/components/MenuSelector'
import OrderSummary from '@/components/OrderSummary'
import PaymentSelector from '@/components/PaymentSelector'
import AdminOrdersTable from '@/components/AdminOrdersTable'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from '@/components/ui/primitives'
import { loadAllMenus } from '@/lib/menuLoader'
import { validateName, validatePhone, validateQuantity } from '@/lib/validators'
import { computeBill, computeOrderBill, formatCurrency } from '@/lib/billing'
import { saveOrder } from '@/lib/orderStore'

export default function App() {
  const [view, setView] = useState('order') // 'order' | 'admin'
  return (
    <div className="min-h-screen">
      <Header view={view} setView={setView} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {view === 'order' ? <OrderFlow /> : <AdminOrdersTable />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground">
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
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
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

const EMPTY_SELECTION = {
  baseId: '',
  pizzaId: '',
  toppingIds: [],
  quantity: '1',
}

function OrderFlow() {
  // --- Menu load state ------------------------------------------------
  const [menu, setMenu] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  // Session timestamp captured when the form starts.
  const sessionStartedAt = useRef(new Date().toISOString())

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await loadAllMenus()
      setMenu(data)
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

  // --- Customer state -------------------------------------------------
  const [customer, setCustomer] = useState({ name: '', phone: '' })
  const [custErrors, setCustErrors] = useState({ name: '', phone: '' })
  const [touched, setTouched] = useState({ name: false, phone: false })

  // --- Combo builder state --------------------------------------------
  const [selection, setSelection] = useState(EMPTY_SELECTION)
  const [selErrors, setSelErrors] = useState({ base: '', pizza: '', quantity: '' })
  const [comboError, setComboError] = useState('')

  // --- Cart (multiple combos per order) -------------------------------
  const [cart, setCart] = useState([])
  const lineCounter = useRef(0)

  // --- Payment / submit -----------------------------------------------
  const [payment, setPayment] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [confirmed, setConfirmed] = useState(null)
  const submittingRef = useRef(false) // synchronous guard vs double-click
  const [submitting, setSubmitting] = useState(false)

  // --- Derived: current builder combo ---------------------------------
  const base = useMemo(
    () => menu?.bases.find((b) => b.id === selection.baseId) || null,
    [menu, selection.baseId]
  )
  const pizza = useMemo(
    () => menu?.pizzas.find((p) => p.id === selection.pizzaId) || null,
    [menu, selection.pizzaId]
  )
  const toppings = useMemo(
    () => menu?.toppings.filter((t) => selection.toppingIds.includes(t.id)) || [],
    [menu, selection.toppingIds]
  )

  const qtyCheck = validateQuantity(selection.quantity)
  const discountActive = qtyCheck.valid && Number(selection.quantity) >= 5

  // Live preview of the combo currently being built (before it's added).
  const preview = useMemo(() => {
    if (!base || !pizza || !qtyCheck.valid) return null
    return computeBill(base, pizza, toppings, selection.quantity)
  }, [base, pizza, toppings, selection.quantity, qtyCheck.valid])

  // Aggregate bill for everything in the cart.
  const orderBill = useMemo(() => computeOrderBill(cart), [cart])

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

  // --- Builder handlers -----------------------------------------------
  function onSelectBase(id) {
    setSelection((s) => ({ ...s, baseId: id }))
    setSelErrors((e) => ({ ...e, base: '' }))
    setComboError('')
  }
  function onSelectPizza(id) {
    setSelection((s) => ({ ...s, pizzaId: id }))
    setSelErrors((e) => ({ ...e, pizza: '' }))
    setComboError('')
  }
  function onToggleTopping(id) {
    setSelection((s) => ({
      ...s,
      toppingIds: s.toppingIds.includes(id)
        ? s.toppingIds.filter((x) => x !== id)
        : [...s.toppingIds, id],
    }))
  }
  function onQuantityChange(value) {
    setSelection((s) => ({ ...s, quantity: value }))
    setSelErrors((e) => ({ ...e, quantity: validateQuantity(value).error }))
  }
  function onQuantityBlur() {
    setSelErrors((e) => ({ ...e, quantity: validateQuantity(selection.quantity).error }))
  }

  // Validate the builder and, if OK, push the combo onto the cart.
  function onAddCombo() {
    const quantityCheck = validateQuantity(selection.quantity)
    const baseErr = selection.baseId ? '' : 'Please select a base.'
    const pizzaErr = selection.pizzaId ? '' : 'Please select a pizza.'

    setSelErrors({ base: baseErr, pizza: pizzaErr, quantity: quantityCheck.error })

    if (baseErr || pizzaErr || !quantityCheck.valid) {
      setComboError('Complete the combo above before adding it.')
      const focusId = baseErr ? null : pizzaErr ? null : !quantityCheck.valid ? 'qty' : null
      const el = focusId && document.getElementById(focusId)
      if (el?.focus) el.focus()
      return
    }

    const lineId = `L${++lineCounter.current}`
    setCart((c) => [
      ...c,
      { lineId, base, pizza, toppings, quantity: Number(selection.quantity) },
    ])
    // Reset the builder for the next pizza.
    setSelection(EMPTY_SELECTION)
    setSelErrors({ base: '', pizza: '', quantity: '' })
    setComboError('')
  }

  // --- Cart handlers --------------------------------------------------
  function updateLineQty(lineId, nextQty) {
    const clamped = Math.max(1, Math.min(10, nextQty))
    setCart((c) =>
      c.map((line) => (line.lineId === lineId ? { ...line, quantity: clamped } : line))
    )
  }
  function removeLine(lineId) {
    setCart((c) => c.filter((line) => line.lineId !== lineId))
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
    if (cartEmpty) setComboError('Add at least one pizza to the order.')

    const ok = nameCheck.valid && phoneCheck.valid && !cartEmpty && !payErr
    if (!ok) {
      const focusId =
        (nameCheck.valid ? '' : 'cust-name') ||
        (phoneCheck.valid ? '' : 'cust-phone')
      const el = focusId && document.getElementById(focusId)
      if (el?.focus) el.focus()
      return
    }

    submittingRef.current = true
    setSubmitting(true)

    // Recompute here so the saved record can never drift from the UI.
    const finalBill = computeOrderBill(cart)

    const order = {
      timestamp: new Date().toISOString(),
      sessionStartedAt: sessionStartedAt.current,
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
    setSelection(EMPTY_SELECTION)
    setSelErrors({ base: '', pizza: '', quantity: '' })
    setComboError('')
    setCart([])
    setPayment('')
    setPaymentError('')
    setConfirmed(null)
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <CustomerIntakeForm
          values={customer}
          errors={custErrors}
          onChange={onCustChange}
          onBlur={onCustBlur}
        />
        <MenuSelector
          menu={menu}
          selection={selection}
          errors={selErrors}
          onSelectBase={onSelectBase}
          onSelectPizza={onSelectPizza}
          onToggleTopping={onToggleTopping}
          onQuantityChange={onQuantityChange}
          onQuantityBlur={onQuantityBlur}
          discountActive={discountActive}
          onAddCombo={onAddCombo}
          comboError={comboError}
          preview={preview}
        />
      </div>

      {/* Live cart + payment + confirm — sticky on desktop. */}
      <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <OrderSummary
          order={orderBill}
          onUpdateQty={updateLineQty}
          onRemove={removeLine}
        />
        <Card>
          <CardHeader>
            <CardTitle>4. Payment &amp; confirm</CardTitle>
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
              className="w-full py-3 text-base"
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
      </div>
    </div>
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
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <div className="mb-1 text-4xl" aria-hidden="true">✅</div>
        <CardTitle>Order confirmed</CardTitle>
        <CardDescription>
          Saved for {order.customerName} · {order.paymentMode}
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
  )
}
