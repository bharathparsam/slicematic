import { motion, useReducedMotion } from 'framer-motion'
import { C, FONT_DISPLAY } from '@/components/order/theme'

export const detailItemVariants = {
  hidden: { opacity: 0, y: -8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
  },
}

export default function AnalyticsDetailCard({ title, definition, children, value }) {
  const reduceMotion = useReducedMotion()
  const body = (
    <>
      <div
        className="mb-2 uppercase"
        style={{ fontSize: 11, letterSpacing: '0.1em', color: C.brown3, fontWeight: 700 }}
      >
        {title}
      </div>
      {definition && (
        <p style={{ fontSize: 12, color: C.brown3, fontWeight: 600, margin: '0 0 8px', lineHeight: 1.35 }}>
          {definition}
        </p>
      )}
      {value != null && (
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, color: C.ink, marginBottom: 8 }}>
          {value}
        </div>
      )}
      <div style={{ fontSize: 14, color: C.brown, fontWeight: 600 }}>{children}</div>
    </>
  )

  if (reduceMotion) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 2px 0 ${C.border}` }}
      >
        {body}
      </div>
    )
  }

  return (
    <motion.div
      variants={detailItemVariants}
      className="rounded-2xl p-5"
      style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 2px 0 ${C.border}` }}
    >
      {body}
    </motion.div>
  )
}
