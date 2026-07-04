import { useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { C } from './theme'

/**
 * A mobile bottom sheet: dimmed backdrop + a rounded panel that springs up from
 * the bottom, matching the design comp. Locks body scroll and closes on Escape /
 * backdrop tap. The panel scrolls internally; put sticky headers/footers in
 * `children`. Respects prefers-reduced-motion.
 */
export default function BottomSheet({ open, onClose, labelledBy, maxHeight = '92vh', children }) {
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: C.scrim }}
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className="noscroll fixed inset-x-0 bottom-0 z-[51] mx-auto w-full max-w-[440px] overflow-y-auto rounded-t-[24px]"
            style={{ background: C.cream, color: C.ink, maxHeight }}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/** The little grabber + sticky header row shared by the sheets. */
export function SheetHeader({ children, onClose }) {
  return (
    <div
      className="sticky top-0 z-[2] px-[22px] pb-2 pt-4"
      style={{ background: `linear-gradient(${C.cream} 82%, rgba(251,245,234,0))` }}
    >
      <div className="mx-auto mb-3.5 h-1 w-10 rounded-full" style={{ background: C.border2 }} />
      <div className="flex items-start justify-between gap-3">
        {children}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[17px] leading-none"
          style={{ background: '#fff', border: `1px solid ${C.border2}`, color: C.brown2 }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/** Sticky footer that fades from transparent into the sheet background. */
export function SheetFooter({ children }) {
  return (
    <div
      className="sticky bottom-0 px-[22px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-3.5"
      style={{ background: `linear-gradient(rgba(251,245,234,0), ${C.cream} 40%)` }}
    >
      {children}
    </div>
  )
}

/** Uppercase amber section label used throughout the sheets. */
export function SectionLabel({ children, extra }) {
  return (
    <div
      className="mb-2.5 uppercase"
      style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: C.gold }}
    >
      {children}
      {extra}
    </div>
  )
}
