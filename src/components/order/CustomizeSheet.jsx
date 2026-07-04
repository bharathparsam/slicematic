import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/billing'
import BottomSheet, { SheetHeader, SheetFooter, SectionLabel } from './BottomSheet'
import { C, FONT_DISPLAY } from './theme'

/**
 * Bottom sheet to build one combo for the tapped pizza: pick a base (required),
 * toggle toppings (optional), choose a quantity (1–10, the domain cap), then add
 * to the cart. All items + prices come from the loaded menu — nothing hardcoded.
 * The live "Add to cart" price is the pre-tax line total (unit × qty).
 */
export default function CustomizeSheet({
  open,
  pizza,
  bases,
  toppings,
  soldOutBases,
  soldOutToppings,
  taxConfig,
  onClose,
  onAdd,
}) {
  const [baseId, setBaseId] = useState(null)
  const [toppingIds, setToppingIds] = useState([])
  const [qty, setQty] = useState(1)

  // Reset the builder whenever a different pizza is opened.
  useEffect(() => {
    if (open) {
      setBaseId(null)
      setToppingIds([])
      setQty(1)
    }
  }, [open, pizza?.id])

  if (!pizza) return null

  const baseObj = bases.find((b) => b.id === baseId)
  const topObjs = toppings.filter((t) => toppingIds.includes(t.id))
  const unit = pizza.price + (baseObj?.price ?? 0) + topObjs.reduce((s, t) => s + t.price, 0)
  const lineTotal = unit * qty
  const canAdd = !!baseObj

  const discPct = Math.round((taxConfig?.discount?.rate ?? 0.1) * 100)
  const minQty = taxConfig?.discount?.minQuantity ?? 5

  function toggleTopping(id) {
    setToppingIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function handleAdd() {
    if (!canAdd) return
    onAdd({ base: baseObj, pizza, toppings: topObjs, quantity: qty })
  }

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="customize-title">
      <SheetHeader onClose={onClose}>
        <div>
          <h2 id="customize-title" style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 26, margin: 0 }}>
            {pizza.name}
          </h2>
          <div className="mt-0.5" style={{ fontSize: 13, color: C.brown2, fontWeight: 600 }}>
            base price {formatCurrency(pizza.price)}
          </div>
        </div>
      </SheetHeader>

      {/* Base — required */}
      <div className="px-[22px] pt-1.5">
        <SectionLabel extra={<span style={{ color: C.red }}> *</span>}>Pick a base</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          {bases.map((b) => {
            const isSold = !!soldOutBases?.has?.(b.id)
            const sel = baseId === b.id && !isSold
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => !isSold && setBaseId(b.id)}
                disabled={isSold}
                aria-disabled={isSold || undefined}
                aria-pressed={sel}
                className="flex w-full items-center justify-between gap-1.5 rounded-[13px] px-3 py-3 transition-colors"
                style={tileStyle(sel, isSold)}
              >
                <span style={{ fontSize: 14, fontWeight: 700 }}>{b.name}</span>
                <span
                  style={{
                    fontSize: isSold ? 11 : 13,
                    fontWeight: 700,
                    textTransform: isSold ? 'uppercase' : 'none',
                    letterSpacing: isSold ? '0.06em' : 0,
                    color: isSold ? C.red : sel ? C.red : C.brown2,
                  }}
                >
                  {isSold ? 'Sold out' : formatCurrency(b.price)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Toppings — optional */}
      {toppings.length > 0 && (
        <div className="px-[22px] pt-[22px]">
          <SectionLabel
            extra={
              <span style={{ color: C.brown2, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                {' '}
                · optional
              </span>
            }
          >
            Add toppings
          </SectionLabel>
          <div className="grid grid-cols-2 gap-2.5">
            {toppings.map((t) => {
              const isSold = !!soldOutToppings?.has?.(t.id)
              const sel = toppingIds.includes(t.id) && !isSold
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => !isSold && toggleTopping(t.id)}
                  disabled={isSold}
                  aria-disabled={isSold || undefined}
                  aria-pressed={sel}
                  className="flex w-full items-center justify-between gap-1.5 rounded-[13px] px-3 py-3 transition-colors"
                  style={tileStyle(sel, isSold)}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex flex-none items-center justify-center rounded-md" style={checkboxStyle(sel)}>
                      {sel ? '✓' : ''}
                    </span>
                    <span className="text-left" style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {t.name}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: isSold ? 11 : 12.5,
                      fontWeight: 700,
                      textTransform: isSold ? 'uppercase' : 'none',
                      letterSpacing: isSold ? '0.06em' : 0,
                      color: isSold ? C.red : C.brown2,
                    }}
                  >
                    {isSold ? 'Sold out' : `+${formatCurrency(t.price)}`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Quantity */}
      <div className="px-[22px] pb-1 pt-[22px]">
        <div className="flex items-center justify-between gap-3">
          <div className="uppercase" style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: C.gold }}>
            Quantity
          </div>
          <Stepper
            qty={qty}
            onDec={() => setQty((q) => Math.max(1, q - 1))}
            onInc={() => setQty((q) => Math.min(10, q + 1))}
          />
        </div>
        <div className="mt-2.5" style={{ fontSize: 12.5, color: C.brown2 }}>
          🍕 {discPct}% off when your whole order hits {minQty}+ pizzas.
        </div>
      </div>

      <SheetFooter>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="w-full rounded-[15px] py-4 font-bold transition-transform active:scale-[0.99]"
          style={
            canAdd
              ? { background: C.red, color: C.cream, fontSize: 16, boxShadow: '0 12px 26px rgba(197,52,28,0.3)' }
              : { background: C.disabledBg, color: C.disabledFg, fontSize: 16, cursor: 'not-allowed' }
          }
        >
          {canAdd ? `Add to cart · ${formatCurrency(lineTotal)}` : 'Pick a base to continue'}
        </button>
      </SheetFooter>
    </BottomSheet>
  )
}

export function Stepper({ qty, onDec, onInc, size = 'lg' }) {
  const dim = size === 'lg' ? 42 : 32
  const num = size === 'lg' ? 40 : 30
  return (
    <div
      className="flex items-center overflow-hidden rounded-xl"
      style={{ border: `1.5px solid ${C.border2}`, background: '#fff' }}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={onDec}
        className="leading-none"
        style={{ width: dim, height: dim, color: C.red, fontSize: size === 'lg' ? 22 : 18 }}
      >
        −
      </button>
      <span className="text-center font-extrabold tabular-nums" style={{ width: num, fontSize: size === 'lg' ? 17 : 14 }}>
        {qty}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={onInc}
        className="leading-none"
        style={{ width: dim, height: dim, color: C.red, fontSize: size === 'lg' ? 20 : 16 }}
      >
        +
      </button>
    </div>
  )
}

function tileStyle(selected, soldOut = false) {
  if (soldOut) {
    return {
      background: C.disabledBg,
      border: `1.5px dashed ${C.border2}`,
      fontFamily: 'inherit',
      opacity: 0.6,
      cursor: 'not-allowed',
    }
  }
  return selected
    ? { background: C.goldBg, border: `2px solid ${C.red}`, fontFamily: 'inherit' }
    : { background: C.tileBg, border: `1.5px solid ${C.border3}`, fontFamily: 'inherit' }
}

function checkboxStyle(selected) {
  return {
    width: 19,
    height: 19,
    fontSize: 12,
    fontWeight: 800,
    color: '#fff',
    background: selected ? C.red : '#fff',
    border: selected ? `2px solid ${C.red}` : '2px solid #d9c6a6',
  }
}
