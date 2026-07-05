import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import AdminAnalytics from '@/components/AdminAnalytics'
import AdminMenu from '@/components/AdminMenu'
import AdminStaff from '@/components/AdminStaff'
import ViewNav from '@/components/ViewNav'
import { kitchenProgressLabel } from '@/lib/analyticsFormat'
import { getAllOrders, completeOrder, cancelOrder } from '@/lib/orderStore'
import { normOrderStatus, summariseOrderItems } from '@/lib/orderDisplay'
import { formatCurrency } from '@/lib/billing'
import { signIn, signOut, isSupabaseConfigured } from '@/lib/auth'
import { C, FONT_DISPLAY, FONT_MONO } from '@/components/order/theme'
import PizzaLoader from '@/components/order/PizzaLoader'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

// Orders table column template (kept in sync between the header + body rows).
// The last track fits the Complete · Modify · Cancel actions on one row.
const GRID = '96px 100px 72px 1.3fr 1.8fr 48px 108px 66px 232px'

export default function AdminOrdersTable({ onModify, onExit, onKitchen, onManager, session, authReady }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [completingId, setCompletingId] = useState('')
  const [confirmOrder, setConfirmOrder] = useState(null)
  const [cancellingId, setCancellingId] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [section, setSection] = useState('orders')
  const [filter, setFilter] = useState('all')

  // Authenticated when there's a Supabase session (owned by App so it survives the
  // Modify round-trip, which unmounts this component while editing an order).
  const unlocked = !!session

  useEffect(() => {
    if (unlocked) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked])

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

  const activeCount = orders.filter((o) => normOrderStatus(o.status) === 'active').length
  const filtered = filter === 'all' ? orders : orders.filter((o) => normOrderStatus(o.status) === filter)

  // "Today so far" — non-cancelled orders placed today (client-derived, no new API).
  const todays = orders.filter((o) => normOrderStatus(o.status) !== 'cancelled' && isToday(o.timestamp))
  const todaySalesN = todays.reduce((s, o) => s + Number(o.total || 0), 0)
  const todayAvgN = todays.length ? todaySalesN / todays.length : 0

  return (
    <div className="min-h-screen w-full" style={{ background: '#efe4d0' }}>
      <div
        className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col"
        style={{ background: '#faf3e6', color: C.ink, boxShadow: '0 0 80px rgba(120,70,20,0.1)' }}
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

        <TopBar
          onExit={onExit}
          onKitchen={onKitchen}
          onManager={onManager}
          authed={unlocked}
          email={session?.user?.email}
          onSignOut={signOut}
        />

        {!unlocked ? (
          !authReady ? <AuthChecking /> : <LoginCard />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:min-h-[calc(100vh-73px)] md:flex-row">
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
            ) : section === 'menu' ? (
              <AdminMenu />
            ) : section === 'staff' ? (
              <AdminStaff />
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
    </div>
  )
}

/* -------------------------------- shell --------------------------------- */

function TopBar({ onExit, onKitchen, onManager, authed, email, onSignOut }) {
  return (
    <header
      className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-4 sm:px-8"
      style={{ background: C.ink, color: C.cream }}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <div
          className="flex h-[42px] w-[42px] items-center justify-center rounded-xl"
          style={{ background: C.red, boxShadow: '0 6px 16px rgba(197,52,28,0.4)' }}
        >
          <span style={{ fontFamily: FONT_DISPLAY, color: C.cream, fontSize: 23, lineHeight: 1 }}>S</span>
        </div>
        <div className="min-w-0" style={{ lineHeight: 1.15 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21 }}>SliceMatic</div>
          <div className="uppercase" style={{ fontSize: 10.5, letterSpacing: '0.16em', color: '#c8a883', fontWeight: 600 }}>
            Hello Rajan!
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
        <ViewNav
          active="admin"
          variant="dark"
          onOrder={onExit}
          onKitchen={onKitchen}
          onManager={onManager}
        />
        {authed && (
          <div className="flex items-center gap-2">
            {email && (
              <span
                className="hidden max-w-[140px] truncate lg:inline"
                title={email}
                style={{ fontSize: 12.5, color: '#c8a883', fontWeight: 600 }}
              >
                {email}
              </span>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-full px-3 py-1.5 font-semibold transition-colors hover:opacity-80 sm:px-3.5 sm:py-2"
              style={{ fontSize: 12, background: '#3a2418', color: '#e8caae' }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

function Sidebar({ section, setSection, activeCount, todaySales, todayOrders, todayAvg }) {
  const items = [
    { key: 'orders', icon: '📋', label: 'Orders', badge: activeCount || '' },
    { key: 'menu', icon: '🍕', label: 'Alter Menu', badge: '' },
    { key: 'staff', icon: '👥', label: 'Staff', badge: '' },
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

/** Brief placeholder while the persisted Supabase session is being restored. */
function AuthChecking() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <PizzaLoader variant="inline" />
    </div>
  )
}

/** Supabase email + password sign-in for the admin portal. */
function LoginCard() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const configured = isSupabaseConfigured

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const result = await signIn(email, password)
    // On success, App's auth listener flips the session and this unmounts; on
    // failure we stay put and surface the reason.
    if (!result.ok) {
      setError(result.message || 'Sign-in failed.')
      setBusy(false)
    }
  }

  const inputStyle = (bad) => ({
    border: `1.5px solid ${bad ? C.red : C.border2}`,
    background: '#fff',
    fontSize: 15,
    color: C.ink,
  })

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        className="w-full max-w-sm rounded-[20px] p-7"
        style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 4px 0 ${C.border}` }}
      >
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: C.red, boxShadow: '0 6px 16px rgba(197,52,28,0.28)' }}
        >
          <span style={{ fontFamily: FONT_DISPLAY, color: C.cream, fontSize: 24, lineHeight: 1 }}>S</span>
        </div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 24, margin: 0, color: C.ink }}>
          Admin sign-in
        </h2>
        <p className="mt-1.5" style={{ fontSize: 13.5, color: C.brown2 }}>
          Staff access only. Sign in with your SliceMatic admin email.
        </p>

        {!configured ? (
          <p
            role="alert"
            className="mt-4 rounded-xl px-4 py-3"
            style={{ background: '#f7e2dd', color: C.red, fontSize: 13, fontWeight: 600 }}
          >
            Supabase isn’t configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in
            your .env.local, then restart the dev server.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div>
              <label htmlFor="admin-email" className="block" style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                aria-invalid={!!error}
                className="mt-1.5 w-full rounded-xl px-3 py-3"
                style={inputStyle(false)}
              />
            </div>
            <div>
              <label htmlFor="admin-pw" className="block" style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>
                Password
              </label>
              <input
                id="admin-pw"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                aria-invalid={!!error}
                aria-describedby={error ? 'admin-auth-error' : undefined}
                className="mt-1.5 w-full rounded-xl px-3 py-3"
                style={inputStyle(!!error)}
              />
            </div>
            {error && (
              <p id="admin-auth-error" role="alert" style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !email || !password}
              className="w-full rounded-xl py-3 font-bold disabled:opacity-60"
              style={{ background: C.red, color: C.cream, fontSize: 15, boxShadow: '0 10px 22px rgba(197,52,28,0.3)' }}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
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
  const PAGE_OPTS = [5, 10, 25, 50]
  const ALL_ROWS = 100000
  const [pageSize, setPageSize] = useState(5)
  const [page, setPage] = useState(1)

  // Back to page 1 whenever the filter changes so you never land on an empty page.
  useEffect(() => setPage(1), [filter])

  const total = orders.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize
  const pageOrders = orders.slice(start, start + pageSize)

  function changePageSize(size) {
    setPageSize(size)
    setPage(1)
  }

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
            {activeCount > 0 && ' · complete or cancel to free tables'}
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
          <div style={{ minWidth: 1044 }}>
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
              <PizzaLoader variant="inline" />
            ) : orders.length === 0 ? (
              <p className="py-10 text-center" style={{ fontSize: 14, color: C.brown2 }}>
                {totalCount === 0 ? 'No orders yet. Place one from Orders.' : 'No orders match this filter.'}
              </p>
            ) : (
              pageOrders.map((o) => {
                const status = normOrderStatus(o.status)
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

        {total > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
            style={{ borderTop: `1px solid ${C.border}`, background: C.cream }}
          >
            <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.brown2, fontWeight: 600 }}>
              <span>Rows</span>
              <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: '#f0e5d2' }}>
                {PAGE_OPTS.map((s) => {
                  const sel = pageSize === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => changePageSize(s)}
                      className="rounded-md px-2.5 py-1 font-bold transition-colors"
                      style={sel ? { background: '#fff', color: C.ink, fontSize: 12.5, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : { background: 'transparent', color: C.brown2, fontSize: 12.5 }}
                    >
                      {s}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => changePageSize(ALL_ROWS)}
                  className="rounded-md px-2.5 py-1 font-bold transition-colors"
                  style={pageSize === ALL_ROWS ? { background: '#fff', color: C.ink, fontSize: 12.5, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : { background: 'transparent', color: C.brown2, fontSize: 12.5 }}
                >
                  All
                </button>
              </div>
              <span className="hidden tabular-nums sm:inline">
                · {start + 1}–{Math.min(start + pageSize, total)} of {total}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <PageBtn disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                ‹ Prev
              </PageBtn>
              <span className="tabular-nums" style={{ fontSize: 12.5, color: C.brown, fontWeight: 700, padding: '0 6px' }}>
                Page {safePage} / {pageCount}
              </span>
              <PageBtn disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
                Next ›
              </PageBtn>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function PageBtn({ disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-3 py-1.5 font-bold transition-colors disabled:opacity-40"
      style={{ border: `1.5px solid ${C.border2}`, background: '#fff', color: C.ink, fontSize: 12.5 }}
    >
      {children}
    </button>
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

function isToday(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return false
  return d.toDateString() === new Date().toDateString()
}
