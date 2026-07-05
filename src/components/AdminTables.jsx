import { useEffect, useState } from 'react'
import {
  listTables,
  createTable,
  setTableBlocked,
  removeTable,
  mergeTablesWithState,
} from '@/lib/tableStore'
import { loadTables } from '@/lib/tablesLoader'
import { getOccupiedTables } from '@/lib/orderStore'
import { C, FONT_DISPLAY } from '@/components/order/theme'
import PizzaLoader from '@/components/order/PizzaLoader'

/**
 * Admin "Tables" tab — add / remove / reserve dine-in tables. Reserved tables
 * are blocked in the customer picker (with a sweet nudge). A table with an open
 * order can't be removed until it's completed/cancelled.
 */
export default function AdminTables() {
  const [tables, setTables] = useState([])
  const [blocked, setBlocked] = useState(() => new Set())
  const [occupied, setOccupied] = useState(() => new Set())
  const [label, setLabel] = useState('Table')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('') // label currently mutating
  const [actionError, setActionError] = useState('')
  const [addNum, setAddNum] = useState('')

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      const [apiRows, cfg, occ] = await Promise.all([listTables(), loadTables(), getOccupiedTables()])
      const merged = mergeTablesWithState(cfg.tables, apiRows, cfg.label)
      setLabel(cfg.label)
      setTables(merged.tables)
      setBlocked(new Set(merged.blocked))
      setOccupied(new Set(occ))
    } catch (err) {
      setLoadError(err?.message || 'Could not load tables.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    const n = addNum.trim()
    if (!/^\d+$/.test(n) || Number(n) < 1) {
      setActionError('Enter a positive table number.')
      return
    }
    setActionError('')
    setBusy('add')
    const res = await createTable(n)
    setBusy('')
    if (res.ok) {
      setAddNum('')
      await refresh()
    } else {
      setActionError(res.message || 'Could not add table.')
    }
  }

  async function toggleReserve(name) {
    if (busy) return
    setBusy(name)
    setActionError('')
    const res = await setTableBlocked(name, !blocked.has(name))
    setBusy('')
    if (res.ok) await refresh()
    else setActionError(res.message || 'Could not update table.')
  }

  async function handleRemove(name) {
    if (busy) return
    setBusy(name)
    setActionError('')
    const res = await removeTable(name)
    setBusy('')
    if (res.ok) await refresh()
    else setActionError(res.message || 'Could not remove table.')
  }

  if (loading) {
    return (
      <main className="min-w-0 flex-1 px-6 py-7 sm:px-8">
        <PizzaLoader variant="inline" />
      </main>
    )
  }

  const freeCount = tables.filter((t) => !occupied.has(t) && !blocked.has(t)).length

  return (
    <main className="min-w-0 flex-1 px-6 py-7 sm:px-8" style={{ animation: 'floatUp .35s ease both' }}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 30, margin: 0, color: C.ink }}>Tables</h1>
          <p style={{ fontSize: 13.5, color: C.brown2, margin: '4px 0 0' }}>
            {tables.length} tables · <span style={{ color: C.green }}>{freeCount} free</span>
            {blocked.size > 0 && <span style={{ color: C.red }}> · {blocked.size} reserved</span>}
          </p>
        </div>
        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="uppercase" style={{ fontSize: 10.5, letterSpacing: '0.08em', color: C.brown3, fontWeight: 700 }}>
              Add table #
            </span>
            <input
              value={addNum}
              onChange={(e) => setAddNum(e.target.value)}
              inputMode="numeric"
              placeholder="13"
              className="w-24 rounded-xl px-3 py-2"
              style={{ border: `1.5px solid ${C.border2}`, background: '#fff', fontSize: 14, color: C.ink }}
            />
          </label>
          <button
            type="submit"
            disabled={busy === 'add'}
            className="rounded-xl px-5 py-2.5 font-bold disabled:opacity-60"
            style={{ background: C.red, color: C.cream, fontSize: 14, boxShadow: '0 4px 0 #e0a93f' }}
          >
            {busy === 'add' ? 'Adding…' : '+ Add'}
          </button>
        </form>
      </div>

      {loadError ? (
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <p role="alert" className="mb-3" style={{ fontSize: 14, color: C.red, fontWeight: 600 }}>{loadError}</p>
          <button type="button" onClick={refresh} className="rounded-full px-4 py-2 font-bold" style={{ background: C.red, color: C.cream, fontSize: 13.5 }}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {actionError && (
            <p role="alert" className="mb-4" style={{ fontSize: 13.5, color: C.red, fontWeight: 600 }}>{actionError}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((name) => {
              const isOccupied = occupied.has(name)
              const isBlocked = !isOccupied && blocked.has(name)
              const status = isOccupied
                ? { text: 'In use', color: C.amber, bg: '#fdeccb' }
                : isBlocked
                  ? { text: 'Reserved', color: C.red, bg: '#fde8e2' }
                  : { text: 'Free', color: C.green, bg: C.greenBg }
              const rowBusy = busy === name
              return (
                <div
                  key={name}
                  className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5"
                  style={{ background: '#fff', border: `1px solid ${C.border}`, opacity: isOccupied ? 0.8 : 1 }}
                >
                  <div className="min-w-0">
                    <div className="truncate" style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{name}</div>
                    <span
                      className="mt-1 inline-block rounded-full px-2 py-0.5"
                      style={{ background: status.bg, color: status.color, fontSize: 11, fontWeight: 700 }}
                    >
                      {status.text}
                    </span>
                  </div>
                  <div className="flex flex-none gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleReserve(name)}
                      disabled={rowBusy || isOccupied}
                      className="rounded-lg px-2.5 py-1.5 font-bold transition-colors disabled:opacity-40"
                      style={
                        isBlocked
                          ? { border: `1.5px solid ${C.border2}`, background: '#fff', color: C.ink, fontSize: 12 }
                          : { border: `1.5px solid #e9c3ba`, background: '#fff', color: C.red, fontSize: 12 }
                      }
                      title={isOccupied ? 'Table has an open order' : undefined}
                    >
                      {isBlocked ? 'Unreserve' : 'Reserve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(name)}
                      disabled={rowBusy || isOccupied}
                      className="rounded-lg px-2.5 py-1.5 font-bold transition-colors disabled:opacity-40"
                      style={{ border: `1.5px solid ${C.border2}`, background: '#fff', color: C.brown, fontSize: 12 }}
                      title={isOccupied ? 'Complete or cancel its order first' : undefined}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-4" style={{ fontSize: 12.5, color: C.brown2 }}>
            Reserved tables show a “Reserved” sign on the order desk; a guest who taps one is nudged to pick a free table.
          </p>
        </>
      )}
    </main>
  )
}
