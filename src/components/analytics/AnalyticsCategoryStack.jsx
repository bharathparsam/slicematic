import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { getCategoryDefinition } from '@/lib/analyticsDefinitions'
import { C, FONT_DISPLAY } from '@/components/order/theme'

const CATEGORY_META = {
  order_times: { label: 'Order times', icon: '⏱', accent: C.red },
  cancellations: { label: 'Cancellations', icon: '✕', accent: '#b06514' },
  table_utilisation: { label: 'Table utilisation', icon: '🪑', accent: C.gold },
  sales: { label: 'Sales', icon: '₹', accent: C.brown2, muted: true },
}

export default function AnalyticsCategoryStack({
  category,
  primaryValue,
  secondaryLine,
  trend,
  trendSentiment = 'neutral',
  expanded,
  onToggle,
  stackDepth = 2,
  detailsId,
  showExpandHint = true,
  children,
}) {
  const reduceMotion = useReducedMotion()
  const meta = CATEGORY_META[category] || { label: category, icon: '•', accent: C.brown2 }
  const regionId = detailsId ?? `analytics-${category}-details`
  const definition = getCategoryDefinition(category)

  const detailPanelVariants = {
    hidden: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : -8 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduceMotion ? 0 : 0.25,
        ease: [0.4, 0, 0.2, 1],
        staggerChildren: reduceMotion ? 0 : 0.08,
      },
    },
  }

  const trendColor =
    trendSentiment === 'positive'
      ? C.green
      : trendSentiment === 'negative'
        ? C.red
        : C.brown2

  const trendArrow = trend?.vs_prior_period != null
    ? `${trend.vs_prior_period > 0 ? '+' : ''}${trend.vs_prior_period}${trend.unit ? ` ${trend.unit}` : '%'} vs last week`
    : null

  const chevron = (
    <motion.span
      aria-hidden
      className="inline-block shrink-0 leading-none"
      style={{ color: meta.accent, fontSize: 14 }}
      animate={{ rotate: expanded ? 180 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      ▾
    </motion.span>
  )

  const detailsPill = !expanded && (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 uppercase"
      style={{
        fontSize: 10,
        letterSpacing: '0.1em',
        fontWeight: 700,
        color: meta.accent,
        border: `1.5px solid ${meta.accent}`,
        background: '#fff',
      }}
      aria-hidden
    >
      Details
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full"
        style={{ background: `${meta.accent}1f` }}
      >
        {chevron}
      </span>
    </span>
  )

  return (
    <div className="relative isolate mb-4">
      {!expanded && stackDepth > 0 && (
        <>
          {[...Array(stackDepth)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-x-0 rounded-[20px]"
              style={{
                top: (i + 1) * 4,
                height: '100%',
                background: '#fff',
                border: `1px solid ${i === 0 ? C.border2 : C.border}`,
                opacity: 0.65 - i * 0.12,
                transform: `scale(${0.985 - i * 0.015})`,
                zIndex: i,
              }}
              animate={reduceMotion ? {} : { y: [0, -2, 0] }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.3 }}
            />
          ))}
        </>
      )}

      <motion.button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={regionId}
        className="relative z-10 w-full overflow-hidden rounded-[20px] p-6 text-left transition-shadow"
        style={{
          background: meta.muted ? '#faf6ef' : '#fff',
          border: `1px solid ${meta.muted ? C.border : meta.accent}`,
          boxShadow: `0 4px 0 ${C.border}`,
        }}
        initial={false}
        animate={
          reduceMotion
            ? {}
            : { scale: expanded ? [0.99, 1] : 1 }
        }
        whileTap={reduceMotion ? {} : { scale: 0.998 }}
        transition={{ scale: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } }}
      >
        <div
          className="pointer-events-none absolute bottom-0 left-0 top-0 w-1 rounded-l-[20px]"
          style={{ background: meta.muted ? C.border2 : meta.accent }}
          aria-hidden
        />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              className="mb-1.5 flex items-center gap-2 uppercase"
              style={{ fontSize: 11, letterSpacing: '0.14em', color: meta.accent, fontWeight: 700 }}
            >
              <span>{meta.icon}</span>
              {meta.label}
            </div>
            {definition && (
              <p
                style={{
                  fontSize: 12,
                  color: C.brown3,
                  fontWeight: 600,
                  margin: '0 0 10px',
                  lineHeight: 1.35,
                }}
              >
                {definition}
              </p>
            )}
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 32, color: C.ink, lineHeight: 1.1 }}>
              {primaryValue ?? '—'}
            </div>
            {secondaryLine && (
              <div className="mt-2" style={{ fontSize: 13, color: C.brown2, fontWeight: 600 }}>
                {secondaryLine}
              </div>
            )}
            {trendArrow && (
              <div className="mt-1.5" style={{ fontSize: 12, color: trendColor, fontWeight: 700 }}>
                {trendArrow}
              </div>
            )}
            {!expanded && showExpandHint && (
              <p style={{ fontSize: 11, color: C.brown3, fontWeight: 600, margin: '8px 0 0' }}>
                Tap for breakdown
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
            {detailsPill}
            {expanded && (
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: `${meta.accent}1f` }}
                aria-hidden
              >
                {chevron}
              </span>
            )}
          </div>
        </div>
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={regionId}
            role="region"
            aria-label={`${meta.label} details`}
            className="mt-3 flex flex-col gap-3"
            variants={detailPanelVariants}
            initial={reduceMotion ? false : 'hidden'}
            animate="show"
            exit={reduceMotion ? undefined : { opacity: 0, y: -8, transition: { duration: 0.2 } }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
