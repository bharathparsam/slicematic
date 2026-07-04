import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { C, FONT_DISPLAY, FONT_BODY } from './theme'

// Light-hearted, safe-for-everyone pizza quips. Cycled while things load so the
// wait feels like part of the fun rather than dead air.
const QUIPS = [
  'Stretching the dough…',
  'Grating an unreasonable amount of cheese…',
  'Getting the pepperoni to line up…',
  'Firing up the stone oven…',
  'Politely ignoring the pineapple debate…',
  'Counting the olives, one by one…',
  'Teaching the dough to do a backflip…',
  'Whispering sweet nothings to the mozzarella…',
  'Waking up the delivery scooter…',
  'Preheating to a toasty 400°C…',
  'Rolling out something delicious…',
  'Making sure every slice is equal…',
]

/**
 * Pizza loader — a spinning, bobbing pizza over a soft shadow with a rotating
 * funny caption and little "baking" dots. Warm SliceMatic theme.
 *
 * variant:
 *   'full'   (default) — full-screen cream splash with the wordmark. App load.
 *   'inline'           — compact, transparent, no wordmark. For panels/sections.
 *
 * Respects prefers-reduced-motion (no spin/bob; quips still cross-fade) and
 * announces politely to screen readers.
 */
export default function PizzaLoader({ variant = 'full', quips = QUIPS }) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(() => Math.floor(Math.random() * quips.length))
  const inline = variant === 'inline'

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % quips.length), 1900)
    return () => clearInterval(id)
  }, [quips.length])

  const pizzaSize = inline ? 'text-5xl' : 'text-7xl'
  const box = inline ? 'h-20 w-20' : 'h-28 w-28'
  const quipSize = inline ? 14.5 : 16

  return (
    <div
      className={
        'flex flex-col items-center justify-center px-6 text-center ' +
        (inline ? 'py-12' : 'min-h-screen')
      }
      style={
        inline
          ? { color: C.ink, fontFamily: FONT_BODY }
          : { background: C.cream, color: C.ink, fontFamily: FONT_BODY }
      }
      role="status"
      aria-live="polite"
    >
      {!inline && (
        <div
          className="mb-10 uppercase"
          style={{ fontFamily: FONT_DISPLAY, fontSize: 15, letterSpacing: '0.14em', color: C.gold }}
        >
          SliceMatic
        </div>
      )}

      {/* Pizza + shadow */}
      <div className={'relative flex items-end justify-center ' + box}>
        <motion.div
          className={pizzaSize}
          aria-hidden="true"
          style={{ transformOrigin: '50% 50%' }}
          animate={reduce ? {} : { y: [0, inline ? -10 : -14, 0] }}
          transition={reduce ? undefined : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.div
            animate={reduce ? {} : { rotate: 360 }}
            transition={reduce ? undefined : { duration: 2.6, repeat: Infinity, ease: 'linear' }}
          >
            🍕
          </motion.div>
        </motion.div>

        <motion.div
          className={'absolute bottom-0 rounded-[50%] ' + (inline ? 'h-1.5 w-12' : 'h-2 w-16')}
          aria-hidden="true"
          style={{ background: 'rgba(120,70,20,0.18)', filter: 'blur(1px)' }}
          animate={reduce ? {} : { scaleX: [1, 0.7, 1], opacity: [0.5, 0.3, 0.5] }}
          transition={reduce ? undefined : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Rotating quip */}
      <div className={'flex items-center justify-center ' + (inline ? 'mt-6 h-6' : 'mt-9 h-7')}>
        <AnimatePresence mode="wait">
          <motion.p
            key={i}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            style={{ fontSize: quipSize, fontWeight: 600, color: C.brown, margin: 0 }}
          >
            {quips[i]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Baking dots */}
      <div className={'flex items-center gap-1.5 ' + (inline ? 'mt-3' : 'mt-4')} aria-hidden="true">
        {[0, 1, 2].map((d) => (
          <motion.span
            key={d}
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: C.red }}
            animate={reduce ? {} : { opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
            transition={
              reduce ? undefined : { duration: 1, repeat: Infinity, ease: 'easeInOut', delay: d * 0.15 }
            }
          />
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
