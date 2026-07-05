import { useEffect, useState } from 'react'
import BottomSheet, { SheetFooter, SheetHeader } from '@/components/order/BottomSheet'
import { C, FONT_DISPLAY, FONT_MONO, shortName } from '@/components/order/theme'

const LABELS = {
  5: 'Loved it',
  4: 'Pretty good',
  3: 'It was okay',
  2: 'Could be better',
  1: 'Not great',
}

/**
 * One-time guest rating for an active table order (5 = best). Opens from the
 * table picker when an occupied table is selected.
 */
export default function RateOrderSheet({
  open,
  order,
  tableLabel = 'Table',
  onClose,
  onSubmit,
}) {
  const [rating, setRating] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    setRating(0)
    setBusy(false)
    setError('')
    setDone(false)
  }, [open, order?.id])

  async function handleSubmit() {
    if (!order?.id || rating < 1 || busy) return
    setBusy(true)
    setError('')
    const result = await onSubmit(order.id, rating)
    setBusy(false)
    if (result?.ok) {
      setDone(true)
      return
    }
    setError(result?.message || 'Could not save your rating.')
  }

  if (!order) return null

  const tableNum = shortName(order.table, tableLabel)

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="rate-order-title" zIndex={70}>
      <SheetHeader onClose={onClose}>
        <div>
          <p
            className="uppercase"
            style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.16em', color: C.red, fontWeight: 600 }}
          >
            Guest feedback
          </p>
          <h2 id="rate-order-title" style={{ fontFamily: FONT_DISPLAY, fontSize: 26, margin: '4px 0 0', fontWeight: 400 }}>
            How was your visit?
          </h2>
        </div>
      </SheetHeader>

      <div className="px-[22px] pb-4">
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: C.brown, margin: '0 0 18px' }}>
          Order <b style={{ color: C.red, fontFamily: FONT_MONO }}>{order.orderCode}</b> at{' '}
          <b style={{ color: C.ink }}>
            {tableLabel} {tableNum}
          </b>
          . Tap a score — 5 is the best.
        </p>

        {done ? (
          <div
            className="rounded-2xl px-5 py-6 text-center"
            style={{ background: C.greenBg, border: `1px solid ${C.green}`, color: C.greenDark }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }} aria-hidden="true">
              ✓
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Thanks for rating us {rating}/5!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Rating from 1 to 5">
              {[5, 4, 3, 2, 1].map((value) => {
                const selected = rating === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRating(value)}
                    className="flex flex-col items-center gap-1 rounded-2xl px-1 py-3 transition-colors"
                    style={{
                      background: selected ? C.red : '#fff',
                      color: selected ? C.cream : C.ink,
                      border: `1.5px solid ${selected ? C.red : C.border2}`,
                    }}
                  >
                    <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">
                      ★
                    </span>
                    <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20 }}>{value}</span>
                  </button>
                )
              })}
            </div>

            <p
              className="mt-3 min-h-[20px] text-center"
              style={{ fontSize: 13.5, color: C.brown2, fontWeight: 600 }}
              aria-live="polite"
            >
              {rating ? LABELS[rating] : 'Pick a score to continue'}
            </p>

            {error ? (
              <p role="alert" className="mt-3 rounded-xl px-4 py-3" style={{ background: '#fde8e4', color: C.red, fontSize: 13 }}>
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>

      <SheetFooter>
        {done ? (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl py-3.5 font-bold text-white"
            style={{ background: C.red, fontSize: 15 }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || rating < 1}
            className="w-full rounded-2xl py-3.5 font-bold text-white disabled:opacity-50"
            style={{ background: C.red, fontSize: 15 }}
          >
            {busy ? 'Saving…' : 'Submit rating'}
          </button>
        )}
      </SheetFooter>
    </BottomSheet>
  )
}
