import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Button, Input, Label, FieldError } from '@/components/ui/primitives'
import { formatCurrency } from '@/lib/billing'

/**
 * Landing / "select your table" — the app's home screen (the order flow's table
 * stage). Redesigned from the Claude Design "SliceMatic Landing" comp: a warm
 * cream + terracotta hospitality look with its own top bar, hero, "how it works"
 * and a featured-menu strip above the live table grid.
 *
 * Everything functional is wired to real data — the table grid, the live "free"
 * count, the pizza-count stat and the featured pizzas all come from the loaded
 * menu / tables / occupancy (never hardcoded). Only the marketing copy (hero
 * lines, the three "how it works" steps) is static content.
 *
 * Fonts (DM Serif Display / Manrope / JetBrains Mono) load from Google Fonts in
 * index.html and degrade to system serif / sans / mono when offline.
 *
 * Behaviour preserved from the previous version: tables with an open order
 * (`occupied`) are blocked with a light "wrong table" nudge; add-table opens the
 * same NewTableModal; radiogroup semantics, keyboard focus and
 * prefers-reduced-motion are all respected.
 */

const FONT_DISPLAY = "'DM Serif Display', Georgia, 'Times New Roman', serif"
const FONT_BODY = "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif"
const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace"

// Palette lifted verbatim from the design comp.
const C = {
  cream: '#fbf5ea',
  ink: '#231610',
  red: '#c5341c',
  brown: '#6b5544',
  brown2: '#8a7159',
  brown3: '#a58a63',
  gold: '#a5601f',
  goldBg: '#fdeccb',
  green: '#3f8f4b',
  greenDark: '#2f7a3b',
  greenBg: '#e7f2e0',
  amber: '#d98a2b',
  border: '#f0e2cc',
  border2: '#e3d4bc',
  border3: '#eeddc2',
}

const STEPS = [
  {
    n: '1',
    title: 'Grab a seat',
    body: 'Walk in, find a table you like, and note its number — no host, no waiting.',
  },
  {
    n: '2',
    title: 'Build your order',
    body: 'Tap your table below, then design your pizza right here — crust, sauce, the works.',
  },
  {
    n: '3',
    title: 'Fresh to your seat',
    body: 'We fire it in the stone oven and bring it hot to your table in about twelve minutes.',
  },
]

// Decorative labels for the "crowd favourites" strip (not menu data).
const FEATURE_TAGS = [
  { t: 'Popular', bg: C.goldBg, fg: C.gold },
  { t: 'House favourite', bg: C.red, fg: C.cream },
  { t: "Chef's pick", bg: C.green, fg: C.cream },
]

/** Show just the distinct part ("12" from "Table 12"), or the full name if custom. */
function shortName(name, label) {
  const prefix = `${label} `
  return name.startsWith(prefix) ? name.slice(prefix.length) : name
}

/** Store hours — mirrors the footer copy (11am–11pm). */
function isOpenNow() {
  const h = new Date().getHours()
  return h >= 11 && h < 23
}

export default function TableSelect({
  tables,
  label = 'Table',
  selected,
  occupied = [],
  menu,
  onSelect,
  onStart,
  onAddTable,
  onAdmin,
}) {
  const occupiedSet = new Set(occupied)
  const [wrongTable, setWrongTable] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const reduce = useReducedMotion()

  const freeCount = tables.filter((t) => !occupiedSet.has(t)).length
  const pizzaCount = menu?.pizzas?.length ?? 0
  const featured = (menu?.pizzas ?? []).slice(0, 3)
  const open = isOpenNow()

  function handleTap(name) {
    if (occupiedSet.has(name)) {
      setWrongTable(name)
      return
    }
    setWrongTable('')
    onSelect(name)
  }

  function scrollToTables() {
    document.getElementById('tables')?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const enter = (i = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] },
        }

  return (
    <div
      className="relative min-h-screen w-full"
      style={{ background: C.cream, color: C.ink, fontFamily: FONT_BODY }}
    >
      <NewTableModal
        open={addOpen}
        label={label}
        onCancel={() => setAddOpen(false)}
        onCreate={async (tableNumber) => {
          const result = await onAddTable?.(tableNumber)
          if (result?.ok) {
            setAddOpen(false)
            setWrongTable('')
            onSelect(result.label)
          }
          return result
        }}
      />

      {/* TOP BAR */}
      <div
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'rgba(251,245,234,0.92)',
          backdropFilter: 'blur(8px)',
          borderColor: C.border,
        }}
      >
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-5 py-3.5 lg:px-8">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: C.red, boxShadow: '0 4px 12px rgba(197,52,28,0.28)' }}
          >
            <span style={{ fontFamily: FONT_DISPLAY, color: C.cream, fontSize: 20, lineHeight: 1 }}>
              S
            </span>
          </div>
          <div className="leading-tight">
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: C.ink }}>SliceMatic</div>
            <div
              className="font-semibold uppercase"
              style={{ fontSize: 10, letterSpacing: '0.12em', color: C.gold }}
            >
              Order Desk · Delhi
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onAdmin && (
            <button
              type="button"
              onClick={onAdmin}
              className="rounded-full px-2.5 py-1 text-xs font-semibold transition-colors hover:opacity-80"
              style={{ color: C.brown2 }}
            >
              Admin
            </button>
          )}
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
            style={
              open
                ? { background: C.greenBg, color: C.greenDark }
                : { background: '#f0e5d2', color: C.brown2 }
            }
          >
            <span
              className="inline-block h-[7px] w-[7px] rounded-full"
              style={{ background: open ? C.green : C.brown3 }}
            />
            {open ? 'Open' : 'Closed'}
          </div>
        </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-5 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,480px)] xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,520px)]">
          {/* LEFT — hero + how it works */}
          <div>
      {/* HERO */}
      <motion.section className="pb-7 pt-6" {...enter(0)}>
        <div
          className="relative overflow-hidden rounded-[22px]"
          style={{
            border: `1px solid ${C.border2}`,
            boxShadow: '0 18px 40px rgba(120,70,20,0.16)',
          }}
        >
          <img
            src="/images/hero.png"
            alt="Wood-fired SliceMatic pizza fresh from the stone oven"
            className="block w-full"
            style={{ aspectRatio: '1376 / 768', objectFit: 'cover' }}
          />
          <div
            className="absolute bottom-3.5 right-3.5 flex items-center gap-2.5 rounded-xl px-3 py-2"
            style={{ background: C.cream, boxShadow: '0 8px 20px rgba(120,70,20,0.22)' }}
          >
            <div
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-white"
              style={{ background: C.green, fontWeight: 800, fontSize: 15 }}
            >
              ✓
            </div>
            <div className="leading-tight">
              <div style={{ fontWeight: 800, fontSize: 12.5 }}>Stone-oven fresh</div>
              <div style={{ fontSize: 11, color: C.brown2 }}>baked to order</div>
            </div>
          </div>
        </div>

        <h1
          className="mt-6"
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 400,
            fontSize: 42,
            lineHeight: 1.03,
            letterSpacing: '-0.4px',
            color: C.ink,
          }}
        >
          Hand-tossed,
          <br />
          <span style={{ color: C.red }}>made to order.</span>
        </h1>
        <p className="mt-3.5" style={{ fontSize: 16, lineHeight: 1.5, color: C.brown }}>
          Grab a seat, pick your table, and build your pizza right here. Fresh from our stone oven,
          straight to you.
        </p>

        <div className="mt-5 flex gap-5">
          <Stat value="12′" caption="to table" />
          <Divider />
          <Stat value="72h" caption="proofed dough" />
          <Divider />
          <Stat value={pizzaCount || '—'} caption={pizzaCount === 1 ? 'pizza' : 'pizzas'} />
        </div>

        <button
          type="button"
          onClick={scrollToTables}
          className="mt-6 block w-full rounded-[15px] py-4 text-center font-bold transition-transform active:scale-[0.99]"
          style={{
            background: C.red,
            color: C.cream,
            fontSize: 17,
            boxShadow: '0 12px 26px rgba(197,52,28,0.3)',
          }}
        >
          Select your table →
        </button>
      </motion.section>

      {/* HOW IT WORKS */}
      <motion.section className="pb-7 pt-1.5" {...enter(1)}>
        <Eyebrow>How it works</Eyebrow>
        <SectionTitle>Three taps to a hot pizza</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="flex items-start gap-4 rounded-2xl px-4 py-4"
              style={{ background: '#fff', border: `1px solid ${C.border}` }}
            >
              <div
                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                style={{
                  background: C.goldBg,
                  color: C.gold,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 19,
                }}
              >
                {s.n}
              </div>
              <div>
                <h3 className="mb-1" style={{ fontSize: 16.5, fontWeight: 800, color: C.ink }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: C.brown, margin: 0 }}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.section>
          </div>

          {/* RIGHT — featured menu + table pick */}
          <div className="pb-32 lg:pb-8">
      {/* FEATURED MENU (real pizzas from the loaded menu) */}
      {featured.length > 0 && (
        <motion.section className="pb-7 pt-6 lg:pt-2" {...enter(2)}>
          <Eyebrow>On the wall today</Eyebrow>
          <SectionTitle className="mb-4">Crowd favourites</SectionTitle>
          <div className="flex flex-col gap-3.5">
            {featured.map((p, i) => {
              const tag = FEATURE_TAGS[i % FEATURE_TAGS.length]
              return (
                <div
                  key={p.id}
                  className="flex gap-3.5 rounded-[18px] p-3"
                  style={{
                    background: '#fff',
                    border: `1px solid ${C.border}`,
                    boxShadow: `0 2px 0 ${C.border}`,
                  }}
                >
                  <div
                    className="flex h-24 w-24 flex-none items-center justify-center rounded-[13px] text-4xl"
                    style={{
                      background:
                        'repeating-linear-gradient(135deg,#efdcc0,#efdcc0 9px,#e9d3b2 9px,#e9d3b2 18px)',
                    }}
                    aria-hidden="true"
                  >
                    🍕
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <div className="mb-1.5">
                      <span
                        className="rounded-full px-2 py-[3px] text-[10px] font-bold uppercase"
                        style={{ background: tag.bg, color: tag.fg, letterSpacing: '0.04em' }}
                      >
                        {tag.t}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3
                        className="truncate"
                        style={{ fontSize: 17, fontWeight: 800, color: C.ink, margin: 0 }}
                      >
                        {p.name}
                      </h3>
                      <span
                        className="whitespace-nowrap"
                        style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: C.red }}
                      >
                        {formatCurrency(p.price)}
                      </span>
                    </div>
                    <p style={{ fontSize: 12.5, lineHeight: 1.4, color: C.brown2, margin: '4px 0 0' }}>
                      Stone-baked fresh to order.
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.section>
      )}

      {/* TABLE SELECT */}
      <motion.section
        id="tables"
        className="pb-6 pt-1.5"
        style={{ scrollMarginTop: 70 }}
        {...enter(3)}
      >
        <div className="mb-1.5 flex items-end justify-between">
          <div>
            <Eyebrow>Ready when you are</Eyebrow>
            <SectionTitle>Select your table</SectionTitle>
          </div>
          <div
            className="whitespace-nowrap rounded-full px-3 py-1.5 font-extrabold"
            style={{ background: '#f0e5d2', color: C.gold, fontSize: 13 }}
          >
            {freeCount} free
          </div>
        </div>

        {/* Legend */}
        <div className="my-3 flex items-center gap-4">
          <LegendDot color={C.green} label="Free" />
          <LegendDot color={C.amber} label="In use" />
        </div>

        {/* "Wrong table" nudge for an occupied table */}
        <AnimatePresence>
          {wrongTable && (
            <motion.div
              key={wrongTable}
              role="alert"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
              className="mb-3 overflow-hidden"
            >
              <div
                className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
                style={{ background: '#fdeccb', border: `1px solid ${C.border2}`, color: C.gold }}
              >
                <WrongTableIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Oops — <span className="font-semibold">{wrongTable}</span> is already munching!
                  Please pick the number shown on <span className="font-semibold">your</span> table.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table grid */}
        <motion.div
          role="radiogroup"
          aria-label="Select your table"
          className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4"
          initial={reduce ? false : 'hidden'}
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.02 } } }}
        >
          {tables.map((name) => {
            const isSelected = selected === name
            const isOccupied = occupiedSet.has(name)
            return (
              <motion.button
                key={name}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${name}${isOccupied ? ', in use' : ''}`}
                onClick={() => handleTap(name)}
                variants={{ hidden: { opacity: 0, scale: 0.92 }, show: { opacity: 1, scale: 1 } }}
                whileTap={isOccupied ? undefined : { scale: 0.96 }}
                className="relative flex flex-col items-center gap-1.5 rounded-[15px] px-2 pb-3.5 pt-[18px] transition-all duration-150 motion-reduce:transition-none"
                style={tableCellStyle(isOccupied, isSelected)}
              >
                <span
                  className="uppercase"
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 9.5,
                    letterSpacing: '0.16em',
                    color: C.brown3,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 34,
                    lineHeight: 1,
                    color: isSelected ? C.red : C.ink,
                  }}
                >
                  {shortName(name, label)}
                </span>
                <span
                  className="inline-flex items-center gap-1 uppercase"
                  style={tableBadgeStyle(isOccupied, isSelected)}
                >
                  {isOccupied ? (
                    <>
                      <DotIcon className="h-1.5 w-1.5" /> In use
                    </>
                  ) : isSelected ? (
                    'Selected ✓'
                  ) : (
                    <>
                      <DotIcon className="h-1.5 w-1.5" /> Free
                    </>
                  )}
                </span>
              </motion.button>
            )
          })}

          {/* Add new table */}
          <motion.button
            type="button"
            aria-label="Add new table"
            onClick={() => setAddOpen(true)}
            variants={{ hidden: { opacity: 0, scale: 0.92 }, show: { opacity: 1, scale: 1 } }}
            whileTap={{ scale: 0.96 }}
            className="flex flex-col items-center justify-center gap-1.5 rounded-[15px] px-2 py-4 transition-all duration-150 hover:opacity-90 motion-reduce:transition-none"
            style={{ background: '#fbf7ee', border: `1.5px dashed ${C.red}`, color: C.red }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: '#fff', border: `1px solid ${C.border2}` }}
            >
              <PlusIcon className="h-5 w-5" />
            </span>
            <span
              className="uppercase"
              style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em' }}
            >
              New
            </span>
          </motion.button>
        </motion.div>
      </motion.section>

      {/* FOOTER */}
      <footer
        className="pb-6 pt-6 text-center lg:hidden"
        style={{ borderTop: `1px solid ${C.border2}`, marginTop: 10 }}
      >
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, color: C.ink }}>SliceMatic</div>
        <div style={{ fontSize: 12, color: C.brown2, marginTop: 4 }}>
          Open daily · 11am – 11pm · Delhi
        </div>
      </footer>
          </div>
        </div>
      </div>

      {/* STICKY ORDER BAR — appears once a (free) table is chosen. */}
      <div className="sticky bottom-0 z-[60] px-4 pb-4 pt-6 lg:px-8">
        <div className="relative mx-auto w-full max-w-[1600px]">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
            style={{ background: `linear-gradient(rgba(251,245,234,0), ${C.cream} 40%)` }}
            aria-hidden="true"
          />
          <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key="go"
              className="relative flex items-center justify-between gap-3 rounded-2xl py-3 pl-[18px] pr-3"
              style={{ background: C.ink, color: C.cream, boxShadow: '0 14px 34px rgba(0,0,0,0.3)' }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {label}{' '}
                <b style={{ fontFamily: FONT_DISPLAY, fontSize: 18 }}>{shortName(selected, label)}</b>{' '}
                selected
              </span>
              <button
                type="button"
                onClick={onStart}
                className="flex-none cursor-pointer rounded-xl px-4 py-2.5 font-bold"
                style={{ background: C.red, color: C.cream, fontSize: 14 }}
              >
                Start ordering →
              </button>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              className="relative py-2 text-center"
              style={{ fontSize: 13, color: C.brown2 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Tap a table above to continue.
            </motion.p>
          )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ small pieces ----------------------------- */

function Stat({ value, caption }) {
  return (
    <div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, color: C.red }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.brown2, fontWeight: 600 }}>{caption}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ width: 1, background: C.border2 }} />
}

function Eyebrow({ children }) {
  return (
    <div
      className="uppercase"
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        letterSpacing: '0.2em',
        color: C.red,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  )
}

function SectionTitle({ children, className = '' }) {
  return (
    <h2
      className={'mb-5 mt-2 ' + className}
      style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 28, color: C.ink }}
    >
      {children}
    </h2>
  )
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: C.brown }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </div>
  )
}

const TABLE_CELL_BASE = { fontFamily: FONT_BODY, cursor: 'pointer' }

function tableCellStyle(busy, selected) {
  if (busy) {
    return {
      ...TABLE_CELL_BASE,
      background: '#faf3e6',
      border: `1.5px dashed ${C.border2}`,
      opacity: 0.7,
      cursor: 'not-allowed',
    }
  }
  if (selected) {
    return {
      ...TABLE_CELL_BASE,
      background: C.goldBg,
      border: `2px solid ${C.red}`,
      boxShadow: '0 10px 22px rgba(197,52,28,0.22)',
      transform: 'translateY(-2px)',
    }
  }
  return { ...TABLE_CELL_BASE, background: '#fbf7ee', border: `1.5px solid ${C.border3}` }
}

function tableBadgeStyle(busy, selected) {
  const base = { fontSize: 9.5, letterSpacing: '0.05em' }
  if (busy) return { ...base, fontWeight: 700, color: C.amber }
  if (selected) return { ...base, fontWeight: 800, color: C.red }
  return { ...base, fontWeight: 700, color: C.green }
}

/* --------------------------------- modal --------------------------------- */

function NewTableModal({ open, label, onCancel, onCreate }) {
  const reduceMotion = useReducedMotion()
  const inputRef = useRef(null)
  const [tableNumber, setTableNumber] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setTableNumber('')
      setError('')
      setBusy(false)
      return
    }

    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, busy, onCancel])

  async function handleSubmit(e) {
    e.preventDefault()
    const num = tableNumber.trim()
    if (!num || !/^\d+$/.test(num) || Number(num) < 1) {
      setError('Enter a valid table number (1 or greater).')
      return
    }

    setBusy(true)
    setError('')
    const result = await onCreate(num)
    setBusy(false)

    if (!result?.ok) {
      setError(result?.message || 'Could not create the table.')
    }
  }

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 420, damping: 32 }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 backdrop-blur-sm"
            style={{ background: 'rgba(35,22,16,0.4)' }}
            onClick={busy ? undefined : onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-table-title"
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-xl shadow-2xl"
            style={{ background: C.cream, color: C.ink, border: `1px solid ${C.border}` }}
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={spring}
          >
            <div
              className="px-6 pb-5 pt-6"
              style={{ borderBottom: `1px solid ${C.border}`, background: '#fff' }}
            >
              <div
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-full"
                style={{ background: C.goldBg, color: C.gold }}
              >
                <PlusIcon className="h-5 w-5" />
              </div>
              <h2
                id="new-table-title"
                style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 400 }}
              >
                Add a table
              </h2>
              <p className="mt-1.5" style={{ fontSize: 14, color: C.brown }}>
                Enter the table number shown on the floor. It will appear as{' '}
                <span className="font-semibold" style={{ color: C.ink }}>
                  {label} #
                </span>
                .
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div>
                <Label htmlFor="new-table-number" required>
                  Table number
                </Label>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="shrink-0 rounded-md px-3 py-2.5 text-sm font-medium"
                    style={{ background: C.goldBg, color: C.gold }}
                  >
                    {label}
                  </span>
                  <Input
                    ref={inputRef}
                    id="new-table-number"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g. 13"
                    value={tableNumber}
                    invalid={!!error}
                    aria-describedby={error ? 'new-table-error' : undefined}
                    onChange={(e) => {
                      setTableNumber(e.target.value.replace(/\D/g, ''))
                      setError('')
                    }}
                    className="text-lg font-bold tabular-nums"
                  />
                </div>
                <FieldError id="new-table-error">{error}</FieldError>
              </div>

              <div
                className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end"
                style={{ borderTop: `1px solid ${C.border}` }}
              >
                <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !tableNumber.trim()}>
                  {busy ? 'Adding…' : 'Add table'}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* --------------------------------- Icons -------------------------------- */

function WrongTableIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function DotIcon({ className }) {
  return (
    <svg viewBox="0 0 8 8" className={className} aria-hidden="true">
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  )
}

function PlusIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
