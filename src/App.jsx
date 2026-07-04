import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import TableSelect from '@/components/TableSelect'
import CustomerIntakeForm from '@/components/CustomerIntakeForm'
import MenuSelector from '@/components/MenuSelector'
import OrderSummary, { BillBreakdown } from '@/components/OrderSummary'
import PaymentSelector from '@/components/PaymentSelector'
import AdminOrdersTable from '@/components/AdminOrdersTable'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from '@/components/ui/primitives'
import { loadAllMenus } from '@/lib/menuLoader'
import { loadTaxConfig, DEFAULT_TAX_CONFIG } from '@/lib/taxConfig'
import { loadTables, DEFAULT_TABLES } from '@/lib/tablesLoader'
import { validateName, validatePhone } from '@/lib/validators'
import { computeOrderBill } from '@/lib/billing'
import { saveOrder, updateOrder, getOccupiedTables } from '@/lib/orderStore'
import { createTable, listTables, mergeTableLabels } from '@/lib/tableStore'

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
      <main
        className={
          'mx-auto w-full px-4 py-6 ' + (view === 'admin' ? 'max-w-none' : 'max-w-3xl')
        }
      >
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
      <footer
        className={
          'mx-auto px-4 pb-8 pt-2 text-center text-xs text-muted-foreground ' +
          (view === 'admin' ? 'max-w-none' : 'max-w-3xl')
        }
      >
        SliceMatic MVP · orders via API · Delhi
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
      <div
        className={
          'mx-auto flex items-center justify-between px-4 py-3 ' +
          (view === 'admin' ? 'max-w-none' : 'max-w-3xl')
        }
      >
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

/**
 * When MODIFYING a saved order, the API returns item component prices as 0 (the
 * DB snapshots line totals, not per-part prices). Re-resolve each part from the
 * loaded menu BY NAME to recover real ids + prices — otherwise the recomputed
 * bill and per-line Edit would break. Falls back to the raw part if unmatched.
 */
function resolveCartFromOrder(order, menu) {
  const byName = (list, name) => list.find((x) => x.name === name)
  return (order?.items ?? []).map((it, i) => ({
    lineId: `L${i + 1}`,
    base: byName(menu.bases, it.base?.name) ?? { id: `b-${i}`, name: it.base?.name ?? '—', price: 0 },
    pizza: byName(menu.pizzas, it.pizza?.name) ?? { id: `p-${i}`, name: it.pizza?.name ?? '—', price: 0 },
    toppings: (it.toppings ?? []).map(
      (t, j) => byName(menu.toppings, t.name) ?? { id: `t-${i}-${j}`, name: t.name, price: 0 }
    ),
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

  async function loadTablesFromApi(cfg) {
    const apiRows = await listTables()
    return mergeTableLabels(cfg.tables, apiRows, cfg.label)
  }

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [data, cfg, tbl] = await Promise.all([loadAllMenus(), loadTaxConfig(), loadTables()])
      setMenu(data)
      setTaxConfig(cfg)
      setTableLabel(tbl.label)
      setTables(await loadTablesFromApi(tbl))
      // Editing: recover real menu prices/ids by name so the bill recomputes right.
      if (isEditing) setCart(resolveCartFromOrder(editingOrder, data))
    } catch (err) {
      setMenu(null)
      setLoadError(err.message || 'Failed to load menu.')
    } finally {
      setLoading(false)
    }
  }

  async function refreshTablesList() {
    const cfg = await loadTables()
    setTableLabel(cfg.label)
    setTables(await loadTablesFromApi(cfg))
  }

  async function handleAddTable(tableNumber) {
    const result = await createTable(tableNumber)
    if (result.ok) {
      await refreshTablesList()
      return { ok: true, label: result.table.label }
    }
    return result
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Stage: pick a table, then order (editing skips table select) ---
  const [stage, setStage] = useState(isEditing ? 'order' : 'table') // 'table' | 'order'
  const [table, setTable] = useState(editingOrder?.table ?? '')

  // Tables with an open (active) order — blocked until admin completes/cancels.
  const [occupiedTables, setOccupiedTables] = useState([])

  async function refreshOccupancy() {
    const occupied = await getOccupiedTables()
    setOccupiedTables(occupied)
  }

  useEffect(() => {
    refreshOccupancy()
  }, [])

  // Re-show the table screen (new order / change table), always with fresh occupancy.
  function goToTableStage() {
    refreshOccupancy()
    refreshTablesList()
    setTable('')
    setStage('table')
  }
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
  const [placeOrderOpen, setPlaceOrderOpen] = useState(false)
  const [placeOrderError, setPlaceOrderError] = useState('')

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

  // --- Place order (review popup) then confirm (API) -------------------
  function validateOrderForm() {
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
      return false
    }
    return true
  }

  function handlePlaceOrder() {
    setPlaceOrderError('')
    if (!validateOrderForm()) return
    setPlaceOrderOpen(true)
  }

  function closePlaceOrderModal() {
    if (submittingRef.current) return
    setPlaceOrderOpen(false)
    setPlaceOrderError('')
  }

  async function handleConfirmOrder() {
    if (submittingRef.current) return

    submittingRef.current = true
    setSubmitting(true)
    setPlaceOrderError('')

    const finalBill = computeOrderBill(cart, taxConfig)

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
      quantity: finalBill.totalQuantity,
      subtotal: finalBill.subtotal,
      discount: finalBill.discount,
      gst: finalBill.gst,
      cgst: finalBill.cgst,
      sgst: finalBill.sgst,
      gstRate: taxConfig.gst.rate,
      total: finalBill.total,
      paymentMode: payment,
    }

    const result = isEditing
      ? await updateOrder({ id: editingOrder.id, status: editingOrder.status, ...payload })
      : await saveOrder({
          timestamp: new Date().toISOString(),
          sessionStartedAt: sessionStartedAt.current,
          ...payload,
        })

    setSubmitting(false)
    submittingRef.current = false

    if (result.ok) {
      setPlaceOrderOpen(false)
      setConfirmedMode(isEditing ? 'updated' : 'created')
      setConfirmed(result.order)
      refreshOccupancy()
    } else {
      setPlaceOrderError(result.message || 'Could not save the order. Please try again.')
    }
  }

  function startNewOrder() {
    resetAfterOrder()
    goToTableStage()
    sessionStartedAt.current = new Date().toISOString()
  }

  function closeReceipt() {
    resetAfterOrder()
    goToTableStage()
  }

  function resetAfterOrder() {
    setCustomer({ name: '', phone: '' })
    setCustErrors({ name: '', phone: '' })
    setTouched({ name: false, phone: false })
    setCart([])
    setCartError('')
    setEditingLineId('')
    setEditSeed(null)
    setPayment('')
    setPaymentError('')
    setPlaceOrderOpen(false)
    setPlaceOrderError('')
    setConfirmed(null)
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
      <OrderReceiptModal
        order={confirmed}
        taxConfig={taxConfig}
        mode={confirmedMode}
        onNew={startNewOrder}
        onClose={closeReceipt}
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
            occupied={occupiedTables}
            onSelect={setTable}
            onStart={() => setStage('order')}
            onAddTable={handleAddTable}
          />
        </motion.div>
      </AnimatePresence>
    )
  }

  // Order-building flow (mobile-first single column).
  return (
    <>
      <PlaceOrderModal
        open={placeOrderOpen}
        bill={orderBill}
        taxConfig={taxConfig}
        table={table}
        customerName={customer.name.trim()}
        paymentMode={payment}
        busy={submitting}
        error={placeOrderError}
        onCancel={closePlaceOrderModal}
        onConfirm={handleConfirmOrder}
      />
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
          onClick={goToTableStage}
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
          <CardTitle>Payment</CardTitle>
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
            onClick={handlePlaceOrder}
            disabled={submitting}
          >
            Place Order
          </Button>
        </CardContent>
      </Card>
    </motion.div>
    </>
  )
}

function PlaceOrderModal({
  open,
  bill,
  taxConfig,
  table,
  customerName,
  paymentMode,
  busy,
  error,
  onCancel,
  onConfirm,
}) {
  const reduceMotion = useReducedMotion()
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!open) return

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
  }, [open, busy, onCancel])

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 420, damping: 32 }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
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
            aria-labelledby="place-order-title"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={spring}
          >
            <div className="border-b border-border bg-gradient-to-br from-brand/10 to-background px-6 pb-5 pt-6">
              <h2 id="place-order-title" className="text-xl font-bold tracking-tight">
                Review your order
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {table ? `${table} · ` : ''}
                {customerName}
                {paymentMode ? ` · ${paymentMode}` : ''}
              </p>
            </div>

            <div className="px-6 py-5">
              <BillBreakdown bill={bill} taxConfig={taxConfig} variant="compact" />
              {error && (
                <p role="alert" className="mt-4 text-sm font-medium text-destructive">
                  {error}
                </p>
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
                className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-dark disabled:opacity-50 sm:min-w-[9rem]"
              >
                {busy ? 'Saving…' : 'Confirm Order'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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

function OrderReceiptModal({ order, taxConfig, mode = 'created', onNew, onClose, onBackToAdmin }) {
  const reduceMotion = useReducedMotion()
  const doneRef = useRef(null)
  const updated = mode === 'updated'

  const bill = useMemo(
    () => ({
      subtotal: order.subtotal ?? 0,
      discount: order.discount ?? 0,
      discountApplied: (order.discount ?? 0) > 0,
      cgst: order.cgst ?? 0,
      sgst: order.sgst ?? 0,
      total: order.total ?? 0,
      totalQuantity: order.quantity ?? 0,
    }),
    [order]
  )

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    doneRef.current?.focus()
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 420, damping: 32 }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
      >
        <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" aria-hidden="true" />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-title"
          className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
          initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring}
        >
          <div className="border-b border-border bg-gradient-to-br from-brand/10 to-background px-6 pb-5 pt-6 text-center">
            <motion.div
              className="mx-auto mb-3 text-5xl"
              aria-hidden="true"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
            >
              ✅
            </motion.div>
            <h2 id="receipt-title" className="text-xl font-bold tracking-tight">
              {updated ? 'Order updated' : 'Order confirmed'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.table ? `${order.table} · ` : ''}
              {order.customerName} · {order.paymentMode}
            </p>
            {order.orderCode && (
              <p className="mt-3 font-mono text-lg font-bold tracking-wide text-brand-dark">
                {order.orderCode}
              </p>
            )}
          </div>

          <div className="px-6 py-5">
            <p className="mb-3 text-sm font-semibold">Tax invoice</p>
            <BillBreakdown bill={bill} taxConfig={taxConfig} />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
            {!updated && (
              <Button variant="outline" className="sm:min-w-[7rem]" onClick={onClose}>
                Close
              </Button>
            )}
            <button
              ref={doneRef}
              type="button"
              onClick={updated ? onBackToAdmin : onNew}
              className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-dark sm:min-w-[9rem]"
            >
              {updated ? 'Back to orders' : 'New order'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
