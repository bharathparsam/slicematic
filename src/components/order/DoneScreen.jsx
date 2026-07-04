import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { formatCurrency } from '@/lib/billing'
import { C, FONT_DISPLAY, shortName } from './theme'

/**
 * Full-screen success state after a saved/updated order. Shows the server-issued
 * order code, the table + name, and what was paid. "Start a new order" resets the
 * flow; when the order was reached via Admin → Modify, it offers "Back to orders".
 */
export default function DoneScreen({ order, label = 'Table', mode = 'created', onNew, onBackToAdmin }) {
  const reduce = useReducedMotion()
  const btnRef = useRef(null)
  const updated = mode === 'updated'
  const nameOrGuest = order.customerName?.trim() || 'Guest'

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    btnRef.current?.focus()
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: C.cream, color: C.ink }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.3 }}
    >
      <motion.div
        className="w-full max-w-[440px] px-8 text-center"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="mx-auto mb-6 flex h-[82px] w-[82px] items-center justify-center rounded-full text-white"
          style={{ background: C.green, fontSize: 42, fontWeight: 800, boxShadow: '0 16px 36px rgba(63,143,75,0.34)' }}
          aria-hidden="true"
          initial={reduce ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
        >
          ✓
        </motion.div>

        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 34, margin: 0 }}>
          {updated ? 'Order updated!' : 'Order placed!'}
        </h2>

        <p className="mt-3" style={{ fontSize: 15.5, lineHeight: 1.55, color: C.brown }}>
          Sit tight, <b style={{ color: C.ink }}>{nameOrGuest}</b> — fresh pizza is on its way to{' '}
          <b style={{ color: C.red }}>
            {label} {shortName(order.table, label)}
          </b>{' '}
          in about 12 minutes.
        </p>

        {order.orderCode && (
          <div className="mt-4" style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: C.red, letterSpacing: '0.02em' }}>
            {order.orderCode}
          </div>
        )}

        <div
          className="mx-auto mt-6 flex max-w-[260px] items-baseline justify-between rounded-2xl px-5 py-4"
          style={{ background: '#fff', border: `1px solid ${C.border}` }}
        >
          <span style={{ fontSize: 14, color: C.brown2, fontWeight: 600 }}>Paid · {order.paymentMode}</span>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: C.red }}>
            {formatCurrency(order.total)}
          </span>
        </div>

        <button
          ref={btnRef}
          type="button"
          onClick={updated ? onBackToAdmin : onNew}
          className="mt-8 rounded-2xl px-7 py-3.5 font-bold"
          style={{ border: `1.5px solid ${C.border2}`, background: '#fff', color: C.ink, fontSize: 15 }}
        >
          {updated ? 'Back to orders' : 'Start a new order'}
        </button>
      </motion.div>
    </motion.div>
  )
}
