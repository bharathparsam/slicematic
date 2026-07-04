import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Button, Input, Label, FieldError } from '@/components/ui/primitives'

/**
 * Landing screen — "select your table". A warm hero (inline SVG mark + serif
 * wordmark) over a soft gradient, then a tappable grid of tables read from
 * config (tablesLoader). Pick a free table → the Order button slides up.
 *
 * Design: culinary/hospitality warmth on the existing orange brand, restrained
 * (one hero panel, one glow, tasteful press/hover). Fully offline — system serif
 * + inline SVG, no external fonts or images. Respects prefers-reduced-motion.
 *
 * Tables with an open order (`occupied`) are blocked: tapping one shows a light
 * "wrong table" nudge instead of selecting it, until an admin completes/cancels
 * that order (see orderStore.getOccupiedTables + the Admin "Complete" action).
 */
export default function TableSelect({
  tables,
  label = 'Table',
  selected,
  occupied = [],
  onSelect,
  onStart,
  onAddTable,
}) {
  const occupiedSet = new Set(occupied)
  const [wrongTable, setWrongTable] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const reduce = useReducedMotion()

  const freeCount = tables.filter((t) => !occupiedSet.has(t)).length

  function handleTap(name) {
    if (occupiedSet.has(name)) {
      setWrongTable(name)
      return
    }
    setWrongTable('')
    onSelect(name)
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col">
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

      {/* Hero */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 via-amber-50 to-background px-6 py-9 text-center shadow-sm"
      >
        {/* soft warm glow behind the mark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-14 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-brand/25 blur-3xl"
        />
        <div className="relative">
          <PizzaMark className="mx-auto h-14 w-14 drop-shadow-sm" />
          <h2 className="mt-3 font-serif text-4xl font-bold leading-none tracking-tight text-brand-dark">
            SliceMatic
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Hand-tossed, made to order · Delhi
          </p>
        </div>
      </motion.section>

      {/* Section label + free count */}
      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Select your table
        </h3>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {freeCount} free
        </span>
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
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <WrongTableIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Oops — <span className="font-semibold">{wrongTable}</span> is already munching!
                Looks like you tapped the wrong one. Please pick the number shown on{' '}
                <span className="font-semibold">your</span> table.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table grid */}
      <motion.div
        role="radiogroup"
        aria-label="Select your table"
        className="grid grid-cols-3 gap-3"
        initial={reduce ? false : 'hidden'}
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }}
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
              whileTap={isOccupied ? undefined : { scale: 0.95 }}
              className={
                'group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border p-2 text-center transition-all duration-200 motion-reduce:transition-none ' +
                (isSelected
                  ? 'border-transparent bg-gradient-to-br from-brand to-brand-dark text-brand-foreground shadow-lg shadow-brand/25'
                  : isOccupied
                    ? 'border-dashed border-muted-foreground/25 bg-muted/60 text-muted-foreground'
                    : 'border-border bg-background text-foreground shadow-sm hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md motion-reduce:hover:translate-y-0')
              }
            >
              {isSelected && (
                <motion.span
                  initial={reduce ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/25"
                >
                  <CheckIcon className="h-3 w-3 text-brand-foreground" />
                </motion.span>
              )}
              <span
                className={
                  'text-[10px] font-medium uppercase tracking-wider ' +
                  (isSelected ? 'text-brand-foreground/80' : 'text-muted-foreground')
                }
              >
                {label}
              </span>
              <span className="font-serif text-2xl font-bold leading-tight tabular-nums">
                {shortName(name, label)}
              </span>
              {isOccupied && !isSelected && (
                <span className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600">
                  <DotIcon className="h-1.5 w-1.5" /> In use
                </span>
              )}
            </motion.button>
          )
        })}

        {/* Add new table */}
        <motion.button
          type="button"
          aria-label="Add new table"
          onClick={() => setAddOpen(true)}
          variants={{ hidden: { opacity: 0, scale: 0.92 }, show: { opacity: 1, scale: 1 } }}
          whileTap={{ scale: 0.95 }}
          className="flex aspect-square flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand/35 bg-brand/5 text-brand-dark transition-all duration-200 hover:border-brand/60 hover:bg-brand/10 hover:shadow-md motion-reduce:transition-none"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-brand/30 bg-background shadow-sm">
            <PlusIcon className="h-5 w-5" />
          </span>
          <span className="mt-2 text-[10px] font-semibold uppercase tracking-wider">New</span>
        </motion.button>
      </motion.div>

      {/* Sticky action — appears once a (free) table is chosen. */}
      <div className="sticky bottom-0 mt-auto -mx-4 bg-gradient-to-t from-muted via-muted px-4 pb-4 pt-6">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key="go"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <Button
                className="w-full bg-gradient-to-r from-brand to-brand-dark py-3.5 text-base shadow-lg shadow-brand/25 hover:from-brand-dark hover:to-brand-dark"
                onClick={onStart}
              >
                Order for {selected}
                <ArrowIcon className="h-4 w-4" />
              </Button>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-2 text-center text-sm text-muted-foreground"
            >
              Tap a table above to continue.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Show just the distinct part ("12" from "Table 12"), or the full name if custom. */
function shortName(name, label) {
  const prefix = `${label} `
  return name.startsWith(prefix) ? name.slice(prefix.length) : name
}

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
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={busy ? undefined : onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-table-title"
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={spring}
          >
            <div className="border-b border-border bg-gradient-to-br from-brand/10 to-background px-6 pb-5 pt-6">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-brand/30 bg-background shadow-sm">
                <PlusIcon className="h-5 w-5 text-brand-dark" />
              </div>
              <h2 id="new-table-title" className="text-xl font-bold tracking-tight">
                Add a table
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter the table number shown on the floor. It will appear as{' '}
                <span className="font-medium text-foreground">{label} #</span>.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div>
                <Label htmlFor="new-table-number" required>
                  Table number
                </Label>
                <div className="mt-2 flex items-center gap-2">
                  <span className="shrink-0 rounded-md bg-muted px-3 py-2.5 text-sm font-medium text-muted-foreground">
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
                    className="font-serif text-lg font-bold tabular-nums"
                  />
                </div>
                <FieldError id="new-table-error">{error}</FieldError>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
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
/** Brand mark — a warm inline pizza slice (offline, scalable, themeable). */
function PizzaMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      {/* crust */}
      <path d="M6 17c8-7 44-7 52 0-8 6-44 6-52 0z" fill="#C2410C" />
      {/* cheese slice */}
      <path d="M8.5 18.5c7.4 4.6 39.6 4.6 47 0L32 58 8.5 18.5z" fill="#FBBF24" />
      {/* pepperoni */}
      <circle cx="25" cy="28" r="3.4" fill="#DC2626" />
      <circle cx="40" cy="30" r="3.4" fill="#DC2626" />
      <circle cx="32" cy="43" r="3" fill="#DC2626" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
