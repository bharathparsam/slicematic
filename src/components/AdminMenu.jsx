import { useEffect, useState } from 'react'
import { loadAllMenus } from '@/lib/menuLoader'
import { getAllSoldOut, setSoldOut } from '@/lib/menuStore'
import { formatCurrency } from '@/lib/billing'
import { C, FONT_DISPLAY } from '@/components/order/theme'
import PizzaLoader from '@/components/order/PizzaLoader'

// Each section maps a menu list (from menuLoader) to its availability type + the
// matching sold-out Set key. `type` is the backend menu_item_type (singular).
const SECTIONS = [
  { menuKey: 'pizzas', soldKey: 'pizzas', type: 'pizza', label: 'Pizzas' },
  { menuKey: 'bases', soldKey: 'bases', type: 'base', label: 'Bases' },
  { menuKey: 'toppings', soldKey: 'toppings', type: 'topping', label: 'Toppings' },
]

const EMPTY_SOLD = { pizzas: new Set(), bases: new Set(), toppings: new Set() }

/**
 * Admin "Menu" tab — availability control for pizzas, bases and toppings. The
 * menu itself is the live data from the .txt files (via menuLoader); this screen
 * only flips the per-item "sold out" overlay, persisted through the menuStore
 * seam. A sold-out item is greyed + badged on the customer order desk (pizzas in
 * the grid, bases/toppings in the customize sheet) and cannot be added.
 */
export default function AdminMenu() {
  const [menu, setMenu] = useState({ pizzas: [], bases: [], toppings: [] })
  const [soldOut, setSoldOutState] = useState(() => EMPTY_SOLD)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [savingId, setSavingId] = useState('') // `${type}:${id}` currently saving
  const [actionError, setActionError] = useState('')

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      const [data, sold] = await Promise.all([loadAllMenus(), getAllSoldOut()])
      setMenu({ pizzas: data.pizzas ?? [], bases: data.bases ?? [], toppings: data.toppings ?? [] })
      setSoldOutState(sold)
    } catch (err) {
      setLoadError(err?.message || 'Could not load the menu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function toggle(item, type, soldKey) {
    if (savingId) return
    const key = `${type}:${item.id}`
    const next = !soldOut[soldKey].has(item.id)
    setSavingId(key)
    setActionError('')

    // Optimistic flip; revert on failure.
    setSoldOutState((prev) => {
      const copy = new Set(prev[soldKey])
      if (next) copy.add(item.id)
      else copy.delete(item.id)
      return { ...prev, [soldKey]: copy }
    })

    const result = await setSoldOut(item, next, type)
    setSavingId('')

    if (result.ok) {
      setSoldOutState((prev) => ({ ...prev, [soldKey]: result.soldOut }))
    } else {
      setSoldOutState((prev) => {
        const copy = new Set(prev[soldKey])
        if (next) copy.delete(item.id)
        else copy.add(item.id)
        return { ...prev, [soldKey]: copy }
      })
      setActionError(result.message || 'Could not update availability.')
    }
  }

  if (loading) {
    return (
      <main className="min-w-0 flex-1 px-6 py-7 sm:px-8">
        <PizzaLoader variant="inline" />
      </main>
    )
  }

  const totalSold = SECTIONS.reduce((n, s) => n + soldOut[s.soldKey].size, 0)

  return (
    <main className="min-w-0 flex-1 px-6 py-7 sm:px-8" style={{ animation: 'floatUp .35s ease both' }}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 27, margin: 0, color: C.ink }}>Menu availability</h1>
          <p style={{ fontSize: 13.5, color: C.brown2, margin: '4px 0 0' }}>
            Mark any pizza, base or topping sold out to grey it out on the order desk.{' '}
            {totalSold > 0 ? `${totalSold} currently sold out.` : 'All available.'}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-full px-4 py-2 font-semibold transition-colors"
          style={{ fontSize: 13, background: '#f0e5d2', color: C.brown }}
        >
          Refresh
        </button>
      </div>

      {loadError ? (
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <p role="alert" className="mb-3" style={{ fontSize: 14, color: C.red, fontWeight: 600 }}>
            {loadError}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="rounded-full px-4 py-2 font-bold"
            style={{ fontSize: 13.5, background: C.red, color: C.cream }}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {actionError && (
            <p role="alert" className="mb-4" style={{ fontSize: 13.5, color: C.red, fontWeight: 600 }}>
              {actionError}
            </p>
          )}
          <div className="flex flex-col gap-7">
            {SECTIONS.map((s) => (
              <Section
                key={s.type}
                label={s.label}
                items={menu[s.menuKey]}
                soldSet={soldOut[s.soldKey]}
                savingId={savingId}
                type={s.type}
                onToggle={(item) => toggle(item, s.type, s.soldKey)}
              />
            ))}
          </div>
        </>
      )}
    </main>
  )
}

function Section({ label, items, soldSet, savingId, type, onToggle }) {
  const soldCount = items.filter((it) => soldSet.has(it.id)).length
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2.5">
        <h2 className="uppercase" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: C.gold }}>
          {label}
        </h2>
        <span style={{ fontSize: 12, color: C.brown2, fontWeight: 600 }}>
          {items.length} item{items.length === 1 ? '' : 's'}
          {soldCount > 0 ? ` · ${soldCount} sold out` : ''}
        </span>
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: C.brown2 }}>None on the menu.</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {items.map((it) => {
            const isSold = soldSet.has(it.id)
            const busy = savingId === `${type}:${it.id}`
            return (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5"
                style={{ background: '#fff', border: `1px solid ${C.border}`, opacity: isSold ? 0.72 : 1 }}
              >
                <div className="min-w-0">
                  <div className="truncate" style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>
                    {it.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.brown2, fontWeight: 600 }}>
                    {formatCurrency(it.price)}
                    {isSold && <span style={{ color: C.red, fontWeight: 700 }}> · Sold out</span>}
                  </div>
                </div>
                <AvailabilityToggle soldOut={isSold} busy={busy} onToggle={() => onToggle(it)} name={it.name} />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Pill switch: green "Available" ⇄ muted "Sold out". */
function AvailabilityToggle({ soldOut, busy, onToggle, name }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      role="switch"
      aria-checked={!soldOut}
      aria-label={`${name} — ${soldOut ? 'sold out, tap to mark available' : 'available, tap to mark sold out'}`}
      className="flex flex-none items-center gap-2 rounded-full px-1 py-1 transition-colors"
      style={{
        width: 118,
        background: soldOut ? '#e7dcc8' : 'rgba(94,194,107,0.16)',
        border: `1px solid ${soldOut ? C.border : 'rgba(94,194,107,0.5)'}`,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.7 : 1,
      }}
    >
      <span
        className="flex h-6 w-6 flex-none items-center justify-center rounded-full transition-transform"
        style={{
          background: soldOut ? '#b7a488' : C.green,
          color: '#fff',
          fontSize: 12,
          fontWeight: 800,
          order: soldOut ? 0 : 2,
        }}
      >
        {soldOut ? '✕' : '✓'}
      </span>
      <span
        className="flex-1 text-center"
        style={{ fontSize: 12.5, fontWeight: 700, color: soldOut ? C.brown2 : '#2f8f3d' }}
      >
        {soldOut ? 'Sold out' : 'Available'}
      </span>
    </button>
  )
}
