import { C } from '@/components/order/theme'

function formatHour(h) {
  if (h === 0 || h === 24) return '12am'
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

/** Store-hours indicator — not table status. */
export function storeHoursLabel(openHour = 11, closeHour = 23) {
  const h = new Date().getHours()
  if (h >= openHour && h < closeHour) return { open: true, text: 'Open' }
  if (h < openHour) return { open: false, text: `Opens ${formatHour(openHour)}` }
  return { open: false, text: `Closed · opens ${formatHour(openHour)}` }
}

export default function StoreHoursBadge({ openHour = 11, closeHour = 23, className = '' }) {
  const { open, text } = storeHoursLabel(openHour, closeHour)

  return (
    <div
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight sm:px-2.5 sm:py-1 sm:text-xs ${className}`}
      style={
        open
          ? { background: C.greenBg, color: C.greenDark }
          : { background: '#f0e5d2', color: C.brown2 }
      }
      title="Restaurant hours — not table availability"
    >
      <span
        className="inline-block h-[6px] w-[6px] shrink-0 rounded-full sm:h-[7px] sm:w-[7px]"
        style={{ background: open ? C.green : C.brown3 }}
        aria-hidden="true"
      />
      <span className="truncate">{text}</span>
    </div>
  )
}
