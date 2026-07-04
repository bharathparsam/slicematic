import { useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { formatCurrency } from '@/lib/billing'
import { C, FONT_DISPLAY, shortName } from './theme'

/**
 * Centered confirmation modal — the last stop before the order is saved. Confirm
 * runs the double-click-guarded submit in the parent; `busy` disables both
 * buttons and `error` surfaces a failed save without losing the sheet underneath.
 */
export default function ReviewModal({
  open,
  bill,
  table,
  label,
  name,
  payment,
  taxConfig,
  busy,
  error,
  onCancel,
  onConfirm,
}) {
  const reduce = useReducedMotion()
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    confirmRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  const cgstPct = Math.round((taxConfig?.gst?.cgst ?? 0.09) * 100)
  const sgstPct = Math.round((taxConfig?.gst?.sgst ?? 0.09) * 100)
  const nameOrGuest = name?.trim() || 'Guest'

  return (
    <AnimatePresence>
      {open && (
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
            aria-labelledby="review-title"
            className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-44px)] max-w-[396px] overflow-hidden rounded-[22px]"
            style={{ background: C.cream, color: C.ink, x: '-50%', y: '-50%', boxShadow: '0 30px 70px rgba(0,0,0,0.35)' }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30 }}
          >
            <div className="px-6 pb-[18px] pt-[22px]" style={{ background: `linear-gradient(${C.goldBg}, ${C.cream})` }}>
              <h2 id="review-title" style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 24, margin: 0 }}>
                Review your order
              </h2>
              <div className="mt-1" style={{ fontSize: 13.5, color: C.brown2, fontWeight: 600 }}>
                {label} {shortName(table, label)} · {nameOrGuest} · {payment}
              </div>
            </div>

            <div className="px-6 pb-1 pt-[18px]">
              <Row label="Price (before GST)" value={formatCurrency(bill.subtotal)} />
              {bill.discount > 0 && (
                <Row label="Bulk discount" value={`−${formatCurrency(bill.discount)}`} color={C.green} />
              )}
              <Row label={`CGST (${cgstPct}%)`} value={formatCurrency(bill.cgst)} />
              <Row label={`SGST (${sgstPct}%)`} value={formatCurrency(bill.sgst)} last />
              <div
                className="flex items-baseline justify-between pt-3.5"
                style={{ borderTop: `1px solid ${C.border2}` }}
              >
                <span style={{ fontSize: 16, fontWeight: 800 }}>Total</span>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: C.red }}>
                  {formatCurrency(bill.total)}
                </span>
              </div>
            </div>

            {error && (
              <p role="alert" className="px-6 pt-3" style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>
                {error}
              </p>
            )}

            <div className="flex gap-2.5 px-6 pb-[22px] pt-[18px]">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="flex-1 rounded-[13px] py-3.5 font-bold disabled:opacity-50"
                style={{ border: `1.5px solid ${C.border2}`, background: '#fff', color: C.ink, fontSize: 15 }}
              >
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="rounded-[13px] py-3.5 font-bold disabled:opacity-60"
                style={{
                  flex: 1.4,
                  background: C.red,
                  color: C.cream,
                  fontSize: 15,
                  boxShadow: '0 10px 22px rgba(197,52,28,0.3)',
                }}
              >
                {busy ? 'Saving…' : 'Confirm Order'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Row({ label, value, color, last }) {
  return (
    <div className="flex justify-between" style={{ fontSize: 14, color: color ?? C.brown, marginBottom: last ? 14 : 9 }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
}
