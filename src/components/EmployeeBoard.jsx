import { useCallback, useEffect, useState } from 'react'
import {
  getQueue,
  assignItem,
  transitionItem,
  formatElapsed,
  slaLevel,
} from '@/lib/kitchenStore'
import {
  listStaff,
  getSelectedStaff,
  isStaffVerified,
  clearStaffSession,
} from '@/lib/staffStore'
import { loadOpsConfig, DEFAULT_OPS_CONFIG } from '@/lib/opsConfig'
import ViewNav from '@/components/ViewNav'
import StaffLoginGate from '@/components/StaffLoginGate'
import { C, FONT_DISPLAY, FONT_BODY } from '@/components/order/theme'

const ACTION_MAP = {
  queued: { label: 'Pick', next: 'assigned', fn: assignItem },
  assigned: { label: 'Start', next: 'preparing', fn: transitionItem },
  preparing: { label: 'Ready', next: 'ready', fn: transitionItem },
  ready: { label: 'Served', next: 'served', fn: transitionItem },
}

export default function EmployeeBoard({ onOrder, onManager, onAdmin }) {
  const [staffList, setStaffList] = useState([])
  const [staff, setStaff] = useState(() =>
    isStaffVerified() ? getSelectedStaff() : null,
  )
  const [queue, setQueue] = useState([])
  const [opsConfig, setOpsConfig] = useState(DEFAULT_OPS_CONFIG)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const items = await getQueue()
      setQueue(items)
    } catch {
      setError('Could not load kitchen queue.')
    }
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const [cfg, list] = await Promise.all([loadOpsConfig(), listStaff()])
      setOpsConfig(cfg)
      setStaffList(list)
      await refresh()
      setLoading(false)
    }
    init()
  }, [refresh])

  useEffect(() => {
    if (!staff || !isStaffVerified()) return undefined
    const id = setInterval(refresh, opsConfig.queue_poll_ms)
    return () => clearInterval(id)
  }, [staff, opsConfig.queue_poll_ms, refresh])

  function handleVerified(member) {
    setStaff(member)
  }

  function handleChangeStaff() {
    clearStaffSession()
    setStaff(null)
  }

  async function handleAction(item) {
    if (!staff || busyId) return
    const action = ACTION_MAP[item.status_code]
    if (!action) return
    setBusyId(item.item_id)
    setError('')
    const result =
      action.fn === assignItem
        ? await assignItem(item.item_id, staff.id)
        : await transitionItem(item.item_id, action.next, staff.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.message || 'Action failed.')
      return
    }
    await refresh()
  }

  const grouped = groupByTable(queue)
  const verified = isStaffVerified() && staff

  return (
    <Shell
      onOrder={onOrder}
      onManager={onManager}
      onAdmin={onAdmin}
      staff={verified ? staff : null}
      onChangeStaff={handleChangeStaff}
    >
      <StaffLoginGate staffList={staffList} onVerified={handleVerified}>
        {error && (
          <p role="alert" className="mb-4 px-6" style={{ color: C.red, fontWeight: 600, fontSize: 14 }}>
            {error}
          </p>
        )}
        {loading && queue.length === 0 ? (
          <p className="px-6 py-12 text-center" style={{ color: C.brown2 }}>Loading queue…</p>
        ) : queue.length === 0 ? (
          <p className="px-6 py-12 text-center" style={{ color: C.brown2, fontSize: 16 }}>
            Kitchen clear — no items waiting.
          </p>
        ) : (
          <div className="flex flex-col gap-6 px-4 py-6 sm:px-8">
            {Object.entries(grouped).map(([table, items]) => (
              <section key={table}>
                <h2
                  className="mb-3 uppercase"
                  style={{ fontSize: 12, letterSpacing: '0.14em', color: C.brown3, fontWeight: 700 }}
                >
                  {table}
                </h2>
                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <ItemCard
                      key={item.item_id}
                      item={item}
                      slaMinutes={opsConfig.prep_sla_minutes}
                      busy={busyId === item.item_id}
                      onAction={() => handleAction(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </StaffLoginGate>
    </Shell>
  )
}

function Shell({ children, onOrder, onManager, onAdmin, staff, onChangeStaff }) {
  return (
    <div className="min-h-screen w-full" style={{ background: '#efe4d0', fontFamily: FONT_BODY }}>
      <div
        className="mx-auto min-h-screen max-w-[900px]"
        style={{ background: '#faf3e6', boxShadow: '0 0 80px rgba(120,70,20,0.1)' }}
      >
        <header
          className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-4 sm:px-8"
          style={{ background: C.ink, color: C.cream }}
        >
          <div className="min-w-0">
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22 }}>Kitchen</div>
            <div style={{ fontSize: 11, color: '#c8a883', fontWeight: 600, letterSpacing: '0.12em' }}>
              SLICEMATIC · KITCHEN
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {staff && (
              <button
                type="button"
                onClick={onChangeStaff}
                className="max-w-[140px] truncate rounded-full px-3 py-1.5 font-semibold sm:max-w-none"
                style={{ background: '#3a2418', color: '#e8c99a', fontSize: 12 }}
                title={staff.full_name}
              >
                {staff.full_name} · switch
              </button>
            )}
            <ViewNav
              active="kitchen"
              variant="dark"
              onOrder={onOrder}
              onManager={onManager}
              onAdmin={onAdmin}
            />
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

function ItemCard({ item, slaMinutes, busy, onAction }) {
  const action = ACTION_MAP[item.status_code]
  const level = slaLevel(item.elapsed_seconds, slaMinutes)
  const slaColors = {
    ok: { bg: C.greenBg, text: C.green, border: '#b8dfc0' },
    warning: { bg: '#fff8e6', text: '#b06514', border: '#e0c878' },
    critical: { bg: '#fdecea', text: C.red, border: '#f0b8b0' },
  }
  const sla = slaColors[level]

  return (
    <article
      className="rounded-2xl p-5"
      style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 4px 0 ${C.border}` }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: C.ink }}>
            {item.pizza_name || 'Pizza'}
          </div>
          <div style={{ fontSize: 13, color: C.brown2, fontWeight: 600 }}>
            {item.base_name}
            {item.toppings?.length ? ` · ${item.toppings.join(', ')}` : ''}
          </div>
        </div>
        <span
          className="rounded-full px-3 py-1 font-bold"
          style={{ background: sla.bg, color: sla.text, border: `1px solid ${sla.border}`, fontSize: 13 }}
        >
          {formatElapsed(item.elapsed_seconds)}
        </span>
      </div>
      <div className="mb-4 flex flex-wrap gap-3 text-sm" style={{ color: C.brown, fontWeight: 600 }}>
        <span>{item.order_code}</span>
        <span>×{item.quantity}</span>
        <span style={{ textTransform: 'capitalize' }}>{item.status_name}</span>
        {item.assigned_staff && <span>· {item.assigned_staff}</span>}
      </div>
      {action && (
        <button
          type="button"
          disabled={busy}
          onClick={onAction}
          className="w-full rounded-xl py-4 font-bold disabled:opacity-60"
          style={{
            background: C.red,
            color: C.cream,
            fontSize: 17,
            boxShadow: '0 4px 0 #9a2810',
          }}
        >
          {busy ? '…' : action.label}
        </button>
      )}
    </article>
  )
}

function groupByTable(items) {
  const map = {}
  for (const item of items) {
    const key = item.table_label || 'No table'
    if (!map[key]) map[key] = []
    map[key].push(item)
  }
  return map
}
