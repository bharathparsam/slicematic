import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TableSelect from '@/components/TableSelect'
import OrderScreen from '@/components/order/OrderScreen'
import DoneScreen from '@/components/order/DoneScreen'
import PizzaLoader from '@/components/order/PizzaLoader'
import AdminOrdersTable from '@/components/AdminOrdersTable'
import { Button } from '@/components/ui/primitives'
import { loadAllMenus } from '@/lib/menuLoader'
import { loadTaxConfig, DEFAULT_TAX_CONFIG } from '@/lib/taxConfig'
import { loadTables, DEFAULT_TABLES } from '@/lib/tablesLoader'
import { validateName, validatePhone } from '@/lib/validators'
import { computeOrderBill } from '@/lib/billing'
import { saveOrder, updateOrder, getOccupiedTables } from '@/lib/orderStore'
import { listTables, mergeTableLabels } from '@/lib/tableStore'
import { getAllSoldOut } from '@/lib/menuStore'
import { getSession, onAuthChange } from '@/lib/auth'

export default function App() {
  const [view, setView] = useState('order') // 'order' | 'admin'
  // A saved order pulled in from Admin for full editing (null = new order).
  const [editingOrder, setEditingOrder] = useState(null)
  // Admin auth session (Supabase). Owned here so a signed-in admin survives the
  // Modify round-trip (Admin unmounts while an order is edited in the Order view).
  // authReady guards the initial async session restore so we don't flash the login.
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let active = true
    getSession().then((s) => {
      if (!active) return
      setSession(s)
      setAuthReady(true)
    })
    const unsubscribe = onAuthChange((s) => setSession(s))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

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

  // Each view is full-bleed and brings its own branded top bar (no generic chrome).
  return (
    <div className="min-h-screen">
      {view === 'order' ? (
        <OrderFlow
          key={editingOrder ? editingOrder.id : 'new'}
          editingOrder={editingOrder}
          onDoneEditing={doneEditing}
          onAdmin={() => goToView('admin')}
        />
      ) : (
        <AdminOrdersTable
          onModify={startModify}
          onExit={() => goToView('order')}
          session={session}
          authReady={authReady}
        />
      )}
    </div>
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

function OrderFlow({ editingOrder = null, onDoneEditing, onAdmin }) {
  const isEditing = !!editingOrder

  // --- Load state (menu required; tax + tables self-default) ----------
  const [menu, setMenu] = useState(null)
  // Sold-out ids per menu type: { pizzas, bases, toppings } (each a Set).
  const [soldOut, setSoldOut] = useState(() => ({
    pizzas: new Set(),
    bases: new Set(),
    toppings: new Set(),
  }))
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
      const [data, cfg, tbl, sold] = await Promise.all([
        loadAllMenus(),
        loadTaxConfig(),
        loadTables(),
        getAllSoldOut(),
      ])
      setMenu(data)
      setSoldOut(sold)
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

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Stage: pick a table, then order (editing skips table select) ---
  const [stage, setStage] = useState(isEditing ? 'order' : 'table') // 'table' | 'order'
  const [table, setTable] = useState(editingOrder?.table ?? '')

  // No router = the window keeps its scroll position across stage swaps. After
  // "Start ordering" the user is usually scrolled down the table list, so the
  // next screen would open mid-page. Reset to the top on every stage change
  // (both table→order and the "Change table" trip back).
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [stage])

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

  // --- Payment / submit -----------------------------------------------
  const [payment, setPayment] = useState(editingOrder?.paymentMode ?? 'Cash')
  const [paymentError, setPaymentError] = useState('')
  const [confirmed, setConfirmed] = useState(null)
  const [confirmedMode, setConfirmedMode] = useState('created') // 'created' | 'updated'
  const submittingRef = useRef(false) // synchronous guard vs double-click
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

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
  // A completed combo arrives from the customize sheet: { base, pizza, toppings,
  // quantity }. If the exact same base+pizza+toppings is already in the cart, bump
  // that line's quantity (capped at 10) instead of adding a duplicate; else append.
  function onAddCombo(combo) {
    const lineId = `L${++lineCounter.current}`
    setCart((c) => {
      const idx = c.findIndex((line) => sameCombination(line, combo))
      if (idx !== -1) {
        return c.map((line, i) =>
          i === idx ? { ...line, quantity: Math.min(10, line.quantity + combo.quantity) } : line
        )
      }
      return [...c, { lineId, ...combo }]
    })
    setCartError('')
  }
  function updateLineQty(lineId, nextQty) {
    const clamped = Math.max(1, Math.min(10, nextQty))
    setCart((c) => c.map((line) => (line.lineId === lineId ? { ...line, quantity: clamped } : line)))
  }
  function removeLine(lineId) {
    setCart((c) => c.filter((line) => line.lineId !== lineId))
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

  async function handleConfirmOrder() {
    if (submittingRef.current) return

    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')

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
      setConfirmedMode(isEditing ? 'updated' : 'created')
      setConfirmed(result.order)
      refreshOccupancy()
    } else {
      setSubmitError(result.message || 'Could not save the order. Please try again.')
    }
  }

  function startNewOrder() {
    resetAfterOrder()
    goToTableStage()
    sessionStartedAt.current = new Date().toISOString()
  }

  function resetAfterOrder() {
    setCustomer({ name: '', phone: '' })
    setCustErrors({ name: '', phone: '' })
    setTouched({ name: false, phone: false })
    setCart([])
    setCartError('')
    setPayment('Cash')
    setPaymentError('')
    setSubmitError('')
    setConfirmed(null)
  }

  // --- Render ---------------------------------------------------------
  if (loading) {
    return <PizzaLoader />
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
      <DoneScreen
        order={confirmed}
        label={tableLabel}
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
            occupied={occupiedTables}
            menu={menu}
            onSelect={setTable}
            onStart={() => setStage('order')}
            onAdmin={onAdmin}
          />
        </motion.div>
      </AnimatePresence>
    )
  }

  // Order-building flow — redesigned grid + bottom-sheet screen.
  return (
    <OrderScreen
      menu={menu}
      soldOut={soldOut}
      taxConfig={taxConfig}
      table={table}
      label={tableLabel}
      isEditing={isEditing}
      editingOrder={editingOrder}
      bill={orderBill}
      customer={customer}
      custErrors={custErrors}
      payment={payment}
      submitting={submitting}
      submitError={submitError}
      onAdd={onAddCombo}
      onQty={updateLineQty}
      onRemove={removeLine}
      onCustChange={onCustChange}
      onCustBlur={onCustBlur}
      onPayment={(m) => {
        setPayment(m)
        setPaymentError('')
      }}
      validate={validateOrderForm}
      onConfirm={handleConfirmOrder}
      onChangeTable={goToTableStage}
      onAdmin={onAdmin}
      onDiscardEdit={onDoneEditing}
    />
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

