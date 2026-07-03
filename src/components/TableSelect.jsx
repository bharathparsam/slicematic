import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/primitives'

/**
 * Landing screen — "select your table". A tappable grid of tables read from
 * config (tablesLoader). Pick one, then the Order button slides up to start the
 * flow. Mobile-first: big tap targets, single sticky action.
 */
export default function TableSelect({ tables, label = 'Table', selected, onSelect, onStart }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="pt-2 text-center"
      >
        <div className="mb-2 text-4xl" aria-hidden="true">🍕</div>
        <h2 className="text-2xl font-extrabold tracking-tight">Welcome to SliceMatic</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap your table to start your order.
        </p>
      </motion.div>

      <motion.div
        role="radiogroup"
        aria-label="Select your table"
        className="mt-6 grid grid-cols-3 gap-3"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.03 } },
        }}
      >
        {tables.map((name) => {
          const isSelected = selected === name
          return (
            <motion.button
              key={name}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(name)}
              variants={{
                hidden: { opacity: 0, scale: 0.9 },
                show: { opacity: 1, scale: 1 },
              }}
              whileTap={{ scale: 0.94 }}
              className={
                'flex aspect-square flex-col items-center justify-center rounded-xl border-2 p-2 text-center transition-colors ' +
                (isSelected
                  ? 'border-brand bg-brand text-brand-foreground shadow-md'
                  : 'border-input bg-background text-foreground hover:bg-muted')
              }
            >
              <span
                className={
                  'text-[10px] font-medium uppercase tracking-wide ' +
                  (isSelected ? 'text-brand-foreground/80' : 'text-muted-foreground')
                }
              >
                {label}
              </span>
              <span className="text-xl font-bold leading-tight tabular-nums">
                {shortName(name, label)}
              </span>
            </motion.button>
          )
        })}
      </motion.div>

      {/* Sticky action — appears once a table is chosen. */}
      <div className="sticky bottom-0 mt-auto -mx-4 bg-gradient-to-t from-muted via-muted px-4 pb-4 pt-6">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key="go"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <Button className="w-full py-3.5 text-base" onClick={onStart}>
                Order for {selected} →
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
              Select a table above to continue.
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
