import { motion, useReducedMotion } from 'framer-motion'
import { getBhayyaRuleIntro, suggestionKey } from '@/lib/suggestionStore'
import { C, FONT_DISPLAY, FONT_BODY } from './theme'

const RULE_LABELS = {
  pairing: 'Goes well',
  hour_bucket: 'Popular now',
  top_seller: 'Best seller',
  attach_rate: 'Often added',
  bulk_discount: 'Deal',
}

function accentColor(s) {
  if (s.rule === 'bulk_discount') return C.green
  const type = s.action?.type
  if (type === 'add_pizza') return C.red
  if (type === 'add_topping') return C.gold
  return C.brown3
}

function BhayyaChefIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="18" r="7" fill={C.goldBg} stroke={C.ink} strokeWidth="1.2" />
      <path
        d="M6 14c0-3.5 2.8-6.3 6.3-6.3.9 0 1.7.2 2.5.5 1.1-1.8 3.1-3 5.4-3 3.5 0 6.3 2.8 6.3 6.3 0 .8-.2 1.6-.5 2.3H6.5A6.2 6.2 0 0 1 6 14Z"
        fill={C.cream}
        stroke={C.ink}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8 14.5h12"
        stroke={C.red}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="11.5" cy="18.5" r="0.9" fill={C.ink} />
      <circle cx="16.5" cy="18.5" r="0.9" fill={C.ink} />
      <path
        d="M12.5 20.5c.8.6 1.7.6 2.5 0"
        stroke={C.ink}
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BhayyaHeader() {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2.5">
        <BhayyaChefIcon />
        <div>
          <div
            style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: C.ink, letterSpacing: '0.01em', lineHeight: 1.2 }}
          >
            Hi, I&apos;m Suggestion Bhayya
          </div>
          <p style={{ fontSize: 12, color: C.brown2, margin: '3px 0 0', fontFamily: FONT_BODY, lineHeight: 1.35 }}>
            I peek at recent orders to help you build a great combo.
          </p>
        </div>
      </div>
    </div>
  )
}

function RuleChip({ rule }) {
  const label = RULE_LABELS[rule]
  if (!label) return null
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 font-bold uppercase"
      style={{
        fontSize: 10,
        letterSpacing: '0.06em',
        color: C.brown,
        background: 'rgba(255,255,255,0.65)',
        border: `1px solid ${C.border2}`,
      }}
    >
      {label}
    </span>
  )
}

function BhayyaLoading() {
  const reduce = useReducedMotion()
  return (
    <div className="flex items-center gap-2.5 py-1" role="status" aria-live="polite">
      <div className="flex items-center gap-1" aria-hidden="true">
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
      <span style={{ fontSize: 13, color: C.brown2 }}>Bhayya is checking recent orders…</span>
      <span className="sr-only">Bhayya is checking recent orders…</span>
    </div>
  )
}

function NotNowButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-bold underline-offset-2 hover:underline"
      style={{
        background: 'none',
        border: 'none',
        padding: '6px 0',
        color: C.brown2,
        fontSize: 12.5,
        cursor: 'pointer',
      }}
    >
      Not now
    </button>
  )
}

function SuggestionRow({ s, onApplyTopping, onApplyPizza, onDismiss }) {
  const stripe = accentColor(s)
  const itemName = s.action?.item_name
  const intro = getBhayyaRuleIntro(s.rule, s)
  const isDeal = s.rule === 'bulk_discount'

  return (
    <li
      className="flex overflow-hidden rounded-xl"
      style={{ background: '#fff', border: `1px solid ${C.border}` }}
    >
      <div className="w-1 shrink-0" style={{ background: stripe }} aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5">
            <RuleChip rule={s.rule} />
          </div>
          {itemName && !isDeal ? (
            <p style={{ fontSize: 14, color: C.ink, fontWeight: 700, margin: '0 0 2px', lineHeight: 1.35 }}>
              {itemName}
            </p>
          ) : null}
          <p
            style={{
              fontSize: 13,
              color: C.brown,
              fontWeight: isDeal || !itemName ? 600 : 500,
              margin: 0,
              lineHeight: 1.45,
            }}
          >
            {intro}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {s.action?.type === 'add_topping' && s.action.item_id && (
            <button
              type="button"
              onClick={() => onApplyTopping?.(s.action.item_id)}
              className="rounded-xl px-3 py-1.5 font-bold"
              style={{ background: C.red, color: C.cream, fontSize: 12.5 }}
            >
              Add
            </button>
          )}
          {s.action?.type === 'add_pizza' && s.action.item_id && (
            <button
              type="button"
              onClick={() => onApplyPizza?.(s.action.item_id)}
              className="rounded-xl px-3 py-1.5 font-bold"
              style={{ background: C.red, color: C.cream, fontSize: 12.5 }}
            >
              Add
            </button>
          )}
          <NotNowButton onClick={() => onDismiss(s)} />
        </div>
      </div>
    </li>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
  },
}

/**
 * Compact upsell card shown on the order menu or while customizing a pizza.
 */
export default function SuggestionBhayya({
  variant = 'sheet',
  suggestions,
  loading,
  onApplyTopping,
  onApplyPizza,
  onDismiss,
  showEmptyState = false,
  emptyMessage = 'Bhayya needs a few more recent orders before I can suggest picks for you.',
}) {
  const reduce = useReducedMotion()
  const isMenu = variant === 'menu'
  const outerClass = isMenu ? 'mx-0 mb-4' : 'mx-[22px] mt-4'
  const cardStyle = { background: C.goldBg, border: `1.5px solid ${C.border}` }

  const cardBody = (content) => (
    <div className={'rounded-2xl p-4 ' + outerClass} style={cardStyle} aria-live="polite">
      <BhayyaHeader />
      {content}
    </div>
  )

  if (!suggestions?.length && !loading) {
    if (!showEmptyState) return null
    const empty = cardBody(
      <p style={{ fontSize: 13, color: C.brown2, margin: 0 }}>{emptyMessage}</p>
    )
    if (reduce) return empty
    return (
      <motion.div variants={cardVariants} initial="hidden" animate="show">
        {empty}
      </motion.div>
    )
  }

  const inner = cardBody(
    loading && suggestions.length === 0 ? (
      <BhayyaLoading />
    ) : (
      <ul className="flex flex-col gap-2.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {suggestions.map((s) => (
          <SuggestionRow
            key={suggestionKey(s)}
            s={s}
            onApplyTopping={onApplyTopping}
            onApplyPizza={onApplyPizza}
            onDismiss={onDismiss}
          />
        ))}
      </ul>
    )
  )

  if (reduce) {
    return (
      <div aria-busy={loading || undefined}>
        {inner}
      </div>
    )
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="show"
      aria-busy={loading || undefined}
    >
      {inner}
    </motion.div>
  )
}
