import { C } from '@/components/order/theme'

const TABS = [
  { key: 'order', label: 'Orders', handler: 'onOrder' },
  { key: 'kitchen', label: 'Kitchen', handler: 'onKitchen' },
  { key: 'manager', label: 'Manager', handler: 'onManager' },
  { key: 'admin', label: 'Admin', handler: 'onAdmin' },
]

/**
 * Shared 4-tab view switcher (Orders · Kitchen · Manager · Admin).
 * Wraps on narrow screens so the bar stays inside the viewport.
 */
export default function ViewNav({
  active,
  onOrder,
  onKitchen,
  onManager,
  onAdmin,
  variant = 'light',
}) {
  const handlers = { onOrder, onKitchen, onManager, onAdmin }
  const dark = variant === 'dark'

  const trackStyle = dark
    ? { background: '#3a2418' }
    : { background: '#f0e5d2' }

  const idleColor = dark ? '#c8a883' : C.brown2
  const activeStyle = dark
    ? { background: C.cream, color: C.ink, fontSize: 12 }
    : { background: C.cream, color: C.ink, fontSize: 11, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }

  const idleStyle = dark
    ? { color: idleColor, fontSize: 12 }
    : { color: idleColor, fontSize: 11 }

  const pad = dark ? 'px-2.5 py-1 sm:px-3 sm:py-1.5' : 'px-2 py-0.5 sm:px-2.5 sm:py-1'

  return (
    <nav
      className={`flex max-w-full flex-wrap items-center justify-end gap-0.5 rounded-full p-[3px] sm:gap-0 ${dark ? 'p-1' : ''}`}
      style={trackStyle}
      aria-label="App views"
    >
      {TABS.map(({ key, label, handler }) => {
        const onClick = handlers[handler]
        const isActive = active === key
        if (!isActive && !onClick) return null
        if (isActive) {
          return (
            <span
              key={key}
              className={`rounded-full font-bold ${pad}`}
              style={activeStyle}
              aria-current="page"
            >
              {label}
            </span>
          )
        }
        return (
          <button
            key={key}
            type="button"
            onClick={onClick}
            className={`rounded-full font-semibold transition-colors hover:opacity-80 ${pad}`}
            style={idleStyle}
          >
            {label}
          </button>
        )
      })}
    </nav>
  )
}
