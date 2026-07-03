import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, FieldError, Button } from '@/components/ui/primitives'
import { validateQuantity } from '@/lib/validators'
import { computeBill, formatCurrency } from '@/lib/billing'
import { DEFAULT_TAX_CONFIG } from '@/lib/taxConfig'

/**
 * Step 2 — Pizza-first builder. The customer taps a pizza; it expands (with
 * motion) to reveal "pick a base", optional toppings and quantity, then an
 * "Add to cart" button. One pizza open at a time (accordion). Each add pushes a
 * combo line up to App via onAddCombo; the math itself lives in lib/billing.
 *
 * Editing: when the cart's Edit button fires, App passes an `editSeed` (the line
 * being edited, incl. a bumping `nonce`). We re-open that pizza pre-filled and
 * scroll to it; the action button becomes "Update item", and onAddCombo updates
 * the existing line in place (App keys off editingLineId). Every name/price
 * comes from the parsed .txt files — nothing is hardcoded.
 */
const EMPTY_BUILDER = { baseId: '', toppingIds: [], quantity: 1 }

export default function MenuSelector({
  menu,
  taxConfig = DEFAULT_TAX_CONFIG,
  onAddCombo,
  editSeed = null,
  editingPizzaId = '',
  onCancelEdit,
}) {
  const [openId, setOpenId] = useState('')
  const [builder, setBuilder] = useState(EMPTY_BUILDER)
  const [baseError, setBaseError] = useState('')
  const [justSaved, setJustSaved] = useState('') // { id, kind } serialised as `${id}:${kind}`
  const [scrollTargetId, setScrollTargetId] = useState('') // pizza to scroll to once expanded

  // An edit request from the cart: open that pizza pre-filled, then scroll to it
  // AFTER its expand animation settles (see PizzaRow's onAnimationComplete) so the
  // final layout — not the mid-animation one — decides the scroll position.
  useEffect(() => {
    if (!editSeed) return
    setOpenId(editSeed.pizzaId)
    setBuilder({
      baseId: editSeed.baseId,
      toppingIds: [...editSeed.toppingIds],
      quantity: editSeed.quantity,
    })
    setBaseError('')
    setScrollTargetId(editSeed.pizzaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSeed?.nonce])

  function toggleOpen(pizzaId) {
    if (openId === pizzaId) {
      setOpenId('')
      if (editingPizzaId === pizzaId) onCancelEdit?.() // collapsing the edited pizza cancels the edit
      return
    }
    // Opening a different pizza abandons an in-progress edit.
    if (editingPizzaId && editingPizzaId !== pizzaId) onCancelEdit?.()
    setOpenId(pizzaId)
    setBuilder(EMPTY_BUILDER)
    setBaseError('')
  }

  function selectBase(id) {
    setBuilder((b) => ({ ...b, baseId: id }))
    setBaseError('')
  }
  function toggleTopping(id) {
    setBuilder((b) => ({
      ...b,
      toppingIds: b.toppingIds.includes(id)
        ? b.toppingIds.filter((x) => x !== id)
        : [...b.toppingIds, id],
    }))
  }
  function setQuantity(next) {
    const clamped = Math.max(1, Math.min(10, next))
    setBuilder((b) => ({ ...b, quantity: clamped }))
  }

  function submit(pizza) {
    if (!builder.baseId) {
      setBaseError('Please pick a base first.')
      return
    }
    const qtyCheck = validateQuantity(builder.quantity) // defensive; stepper is already clamped
    if (!qtyCheck.valid) return

    const base = menu.bases.find((b) => b.id === builder.baseId)
    const toppings = menu.toppings.filter((t) => builder.toppingIds.includes(t.id))
    const wasEditing = editingPizzaId === pizza.id

    onAddCombo({ base, pizza, toppings, quantity: builder.quantity })

    // Collapse + brief confirmation on the row.
    setOpenId('')
    const key = `${pizza.id}:${wasEditing ? 'Updated' : 'Added'}`
    setJustSaved(key)
    window.setTimeout(() => setJustSaved((cur) => (cur === key ? '' : cur)), 1400)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose your pizza</CardTitle>
        <CardDescription>
          Tap a pizza, pick a base, add toppings, then add it to your order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {menu.pizzas.map((pizza) => {
          const savedKind = justSaved.startsWith(`${pizza.id}:`) ? justSaved.split(':')[1] : ''
          return (
            <PizzaRow
              key={pizza.id}
              pizza={pizza}
              menu={menu}
              taxConfig={taxConfig}
              open={openId === pizza.id}
              editing={editingPizzaId === pizza.id}
              savedKind={savedKind}
              shouldScroll={scrollTargetId === pizza.id}
              onScrolled={() => setScrollTargetId('')}
              builder={openId === pizza.id ? builder : EMPTY_BUILDER}
              baseError={openId === pizza.id ? baseError : ''}
              onToggleOpen={() => toggleOpen(pizza.id)}
              onSelectBase={selectBase}
              onToggleTopping={toggleTopping}
              onSetQuantity={setQuantity}
              onSubmit={() => submit(pizza)}
              onCancelEdit={onCancelEdit}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}

function PizzaRow({
  pizza,
  menu,
  taxConfig,
  open,
  editing,
  savedKind,
  shouldScroll,
  onScrolled,
  builder,
  baseError,
  onToggleOpen,
  onSelectBase,
  onToggleTopping,
  onSetQuantity,
  onSubmit,
  onCancelEdit,
}) {
  const base = menu.bases.find((b) => b.id === builder.baseId) || null
  const toppings = menu.toppings.filter((t) => builder.toppingIds.includes(t.id))
  const preview = base ? computeBill(base, pizza, toppings, builder.quantity, taxConfig) : null
  const discountActive = builder.quantity >= (taxConfig.discount?.minQuantity ?? 5)

  return (
    <div
      id={`pizza-${pizza.id}`}
      className={
        'scroll-mt-20 overflow-hidden rounded-xl border transition-colors ' +
        (open ? 'border-brand ring-1 ring-brand' : 'border-input')
      }
    >
      {/* Tappable header */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-foreground">{pizza.name}</span>
          <span className="text-xs text-muted-foreground">from {formatCurrency(pizza.price)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <AnimatePresence>
            {savedKind && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand-dark"
              >
                {savedKind} ✓
              </motion.span>
            )}
          </AnimatePresence>
          {editing && !open && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand-dark">
              Editing
            </span>
          )}
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-muted-foreground"
          >
            ▾
          </motion.span>
        </span>
      </button>

      {/* Expanding builder */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            onAnimationComplete={() => {
              if (open && shouldScroll) {
                document
                  .getElementById(`pizza-${pizza.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                onScrolled?.()
              }
            }}
            className="overflow-hidden"
          >
            <div className="space-y-5 border-t border-border px-4 pb-4 pt-4">
              {editing && (
                <p className="rounded-md bg-brand/5 px-3 py-2 text-xs font-medium text-brand-dark">
                  Editing this item — change it below, then update.
                </p>
              )}

              {/* Base — required */}
              <fieldset>
                <legend className="text-sm font-medium text-foreground">
                  Pick a base <span className="text-destructive">*</span>
                </legend>
                <div
                  role="radiogroup"
                  aria-label="Pizza base"
                  aria-describedby={baseError ? `base-error-${pizza.id}` : undefined}
                  className="mt-2 grid gap-2 sm:grid-cols-2"
                >
                  {menu.bases.map((b) => (
                    <OptionRow
                      key={b.id}
                      type="radio"
                      name={`base-${pizza.id}`}
                      checked={builder.baseId === b.id}
                      onChange={() => onSelectBase(b.id)}
                      label={b.name}
                      price={b.price}
                    />
                  ))}
                </div>
                <FieldError id={`base-error-${pizza.id}`}>{baseError}</FieldError>
              </fieldset>

              {/* Toppings — optional */}
              <fieldset>
                <legend className="text-sm font-medium text-foreground">
                  Add toppings <span className="text-muted-foreground">(optional)</span>
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {menu.toppings.map((t) => (
                    <OptionRow
                      key={t.id}
                      type="checkbox"
                      name={`topping-${pizza.id}`}
                      checked={builder.toppingIds.includes(t.id)}
                      onChange={() => onToggleTopping(t.id)}
                      label={t.name}
                      price={t.price}
                    />
                  ))}
                </div>
              </fieldset>

              {/* Quantity */}
              <div>
                <span className="text-sm font-medium text-foreground">Quantity</span>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <QtyStepper value={builder.quantity} onChange={onSetQuantity} label={pizza.name} />
                  <p
                    className={
                      'text-right text-xs ' +
                      (discountActive ? 'font-medium text-brand-dark' : 'text-muted-foreground')
                    }
                  >
                    {discountActive
                      ? '🎉 Qualifies for 10% bulk discount'
                      : `10% off when your order totals ${taxConfig.discount?.minQuantity ?? 5}+ pizzas`}
                  </p>
                </div>
              </div>

              {/* Action(s) */}
              <div className="flex gap-2">
                {editing && (
                  <Button variant="outline" className="py-3" onClick={onCancelEdit}>
                    Cancel
                  </Button>
                )}
                <Button className="flex-1 py-3 text-base" onClick={onSubmit}>
                  {editing
                    ? preview
                      ? `Update item · ${formatCurrency(preview.total)}`
                      : 'Update item'
                    : preview
                      ? `Add to cart · ${formatCurrency(preview.total)}`
                      : 'Add to cart'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A single selectable row with label + price, works as radio or checkbox. */
function OptionRow({ type, name, checked, onChange, label, price }) {
  return (
    <label
      className={
        'flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors ' +
        (checked ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-input hover:bg-muted')
      }
    >
      <span className="flex items-center gap-2.5">
        <input
          type={type}
          name={name}
          checked={checked}
          onChange={onChange}
          className="h-4 w-4 accent-brand"
        />
        <span className="font-medium text-foreground">{label}</span>
      </span>
      <span className="tabular-nums text-muted-foreground">{formatCurrency(price)}</span>
    </label>
  )
}

/** Inline quantity stepper, bounded 1–10, keyboard + screen-reader friendly. */
function QtyStepper({ value, onChange, label }) {
  return (
    <div className="inline-flex items-center rounded-md border border-input">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label={`Decrease quantity of ${label}`}
        className="h-10 w-10 text-lg font-semibold text-foreground disabled:opacity-30"
      >
        −
      </button>
      <span className="w-10 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= 10}
        aria-label={`Increase quantity of ${label}`}
        className="h-10 w-10 text-lg font-semibold text-foreground disabled:opacity-30"
      >
        +
      </button>
    </div>
  )
}
