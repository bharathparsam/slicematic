import { useEffect, useRef, useState } from 'react'
import { formatCurrency } from '@/lib/billing'
import {
  DEFAULT_SUGGESTION_CONFIG,
  dismissSuggestion,
  getMenuSuggestions,
  loadSuggestionConfig,
  mergeMenuSuggestions,
  suggestionKey,
} from '@/lib/suggestionStore'
import ViewNav from '@/components/ViewNav'
import CustomizeSheet from './CustomizeSheet'
import CartSheet from './CartSheet'
import ReviewModal from './ReviewModal'
import PizzaLoader from './PizzaLoader'
import SuggestionBhayya from './SuggestionBhayya'
import { C, FONT_DISPLAY, FONT_MONO, shortName } from './theme'

// Contextual, order-specific quips for the "saving" moment.
const SAVING_QUIPS = [
  'Sending your order to the kitchen…',
  'Telling the chef to fire it up…',
  'Reserving your slice of the oven…',
  'Rolling out your pizzas…',
  'Almost plated…',
]

/**
 * The order-building screen (post table selection), redesigned to the "SliceMatic
 * Order" comp: a top bar, the "ordering for" table bar, a grid of the real menu
 * pizzas, and a sticky cart bar. Tapping a pizza opens the customize sheet; the
 * cart bar opens the checkout sheet; "Review" opens the confirm modal.
 *
 * Presentational: all cart / customer / payment state and the actual save live in
 * the parent (OrderFlow). This component only owns which overlay is visible.
 */
export default function OrderScreen({
  menu,
  soldOut,
  taxConfig,
  table,
  label,
  isEditing,
  editingOrder,
  bill,
  customer,
  custErrors,
  payment,
  submitting,
  submitError,
  onAdd,
  onQty,
  onRemove,
  onClearCart,
  onCustChange,
  onCustBlur,
  onPayment,
  validate,
  onConfirm,
  onChangeTable,
  onAdmin,
  onKitchen,
  onManager,
  onDiscardEdit,
}) {
  const [sheet, setSheet] = useState(null) // 'customize' | 'cart' | null
  const [activePizza, setActivePizza] = useState(null)
  const [showReview, setShowReview] = useState(false)
  const [suggestionConfig, setSuggestionConfig] = useState(null)
  const [apiMenuSuggestions, setApiMenuSuggestions] = useState([])
  const [menuSuggestionsLoading, setMenuSuggestionsLoading] = useState(false)
  const [menuDismissTick, setMenuDismissTick] = useState(0)
  const menuDebounceRef = useRef(null)

  const pizzas = menu?.pizzas ?? []
  const minBasePrice = (menu?.bases ?? []).reduce(
    (min, b) => (b.price < min ? b.price : min),
    (menu?.bases ?? [])[0]?.price ?? 0
  )

  // How many of each pizza (by id) are already in the cart.
  const inCart = {}
  bill.lines.forEach((l) => {
    inCart[l.pizza?.id] = (inCart[l.pizza?.id] ?? 0) + l.quantity
  })

  const hasCart = bill.lines.length > 0
  const num = shortName(table, label)

  const soldOutPizzaIds = soldOut?.pizzas ? [...soldOut.pizzas] : []
  const cartPizzaIds = bill.lines.map((l) => l.pizza?.id).filter(Boolean)

  useEffect(() => {
    loadSuggestionConfig().then(setSuggestionConfig)
  }, [])

  useEffect(() => {
    if (menuDebounceRef.current) clearTimeout(menuDebounceRef.current)
    menuDebounceRef.current = setTimeout(async () => {
      setMenuSuggestionsLoading(true)
      const data = await getMenuSuggestions({
        cartQty: bill?.totalQuantity ?? 0,
        excludePizzaIds: soldOutPizzaIds,
      })
      setApiMenuSuggestions(data.suggestions ?? [])
      setMenuSuggestionsLoading(false)
    }, 300)

    return () => {
      if (menuDebounceRef.current) clearTimeout(menuDebounceRef.current)
    }
  }, [bill?.totalQuantity, soldOutPizzaIds.join(',')])

  const menuSuggestions = mergeMenuSuggestions(apiMenuSuggestions, {
    config: suggestionConfig ?? DEFAULT_SUGGESTION_CONFIG,
    soldOutPizzas: soldOut?.pizzas,
    cartPizzaIds,
    pizzas,
  })
  void menuDismissTick

  function openCustomize(pizza) {
    setActivePizza(pizza)
    setSheet('customize')
  }
  function handleMenuDismiss(suggestion) {
    dismissSuggestion(suggestionKey(suggestion))
    setMenuDismissTick((n) => n + 1)
  }

  function handleApplyMenuPizza(pizzaId) {
    const target = pizzas.find((p) => p.id === pizzaId)
    if (target && !soldOut?.pizzas?.has?.(pizzaId)) openCustomize(target)
  }

  function handleApplyCustomizePizza(pizzaId) {
    const target = pizzas.find((p) => p.id === pizzaId)
    if (target && !soldOut?.pizzas?.has?.(pizzaId)) setActivePizza(target)
  }

  function handleAdd(combo) {
    onAdd(combo)
    setSheet(null)
  }
  function handleRemove(lineId) {
    onRemove(lineId)
    if (bill.lines.length <= 1) setSheet(null) // removed the last item
  }
  function handleClear() {
    onClearCart?.()
    setSheet(null) // cart is empty now — close the sheet
  }
  function handleReview() {
    if (validate()) setShowReview(true)
  }
  async function handleConfirm() {
    await onConfirm() // success unmounts this screen (parent shows DoneScreen)
  }

  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[440px]"
      style={{ background: C.cream, color: C.ink, paddingBottom: 96 }}
    >
      {/* TOP BAR */}
      <div
        className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
        style={{ background: 'rgba(251,245,234,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
            style={{ background: C.red, boxShadow: '0 4px 12px rgba(197,52,28,0.28)' }}
          >
            <span style={{ fontFamily: FONT_DISPLAY, color: C.cream, fontSize: 19, lineHeight: 1 }}>S</span>
          </div>
          <div className="min-w-0 leading-tight">
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17 }}>SliceMatic</div>
            <div className="font-semibold uppercase" style={{ fontSize: 10, letterSpacing: '0.12em', color: C.gold }}>
              Orders
            </div>
          </div>
        </div>
        <ViewNav
          active="order"
          onKitchen={onKitchen}
          onManager={onManager}
          onAdmin={onAdmin}
        />
      </div>

      {/* EDIT BANNER */}
      {isEditing && (
        <div
          className="mx-5 mt-4 flex items-center justify-between rounded-2xl px-4 py-3"
          style={{ background: C.goldBg, border: `1px solid ${C.goldBorder}` }}
        >
          <div style={{ fontSize: 14, color: C.gold, fontWeight: 600 }}>
            Modifying{' '}
            <b style={{ color: C.red, fontFamily: FONT_MONO }}>{editingOrder?.orderCode}</b>
          </div>
          <button type="button" onClick={onDiscardEdit} style={{ color: C.red, fontWeight: 700, fontSize: 13.5 }}>
            Discard
          </button>
        </div>
      )}

      {/* TABLE BAR */}
      <div
        className="mx-5 mt-4 flex items-center justify-between rounded-2xl px-4 py-3"
        style={{ background: C.goldBg, border: `1px solid ${C.goldBorder}` }}
      >
        <div style={{ fontSize: 14, color: '#8a5a2a', fontWeight: 600 }}>
          Ordering for{' '}
          <b style={{ color: C.red, fontFamily: FONT_DISPLAY, fontSize: 16 }}>
            {label} {num}
          </b>
        </div>
        <button type="button" onClick={onChangeTable} style={{ color: C.red, fontWeight: 700, fontSize: 13.5 }}>
          Change
        </button>
      </div>

      {/* MENU */}
      <section className="px-5 pb-2.5 pt-[22px]">
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 29, margin: 0 }}>Choose your pizza</h1>
        <p style={{ fontSize: 14, color: C.brown2, margin: '6px 0 20px' }}>
          Tap a pizza to pick a base and toppings.
        </p>
        <SuggestionBhayya
          variant="menu"
          suggestions={menuSuggestions}
          loading={menuSuggestionsLoading}
          onApplyPizza={handleApplyMenuPizza}
          onDismiss={handleMenuDismiss}
        />
        <div className="grid grid-cols-2 gap-3">
          {pizzas.map((p) => {
            const isSold = !!soldOut?.pizzas?.has?.(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => !isSold && openCustomize(p)}
                disabled={isSold}
                aria-disabled={isSold || undefined}
                className="flex flex-col rounded-2xl p-[11px] text-left transition-transform active:scale-[0.98] disabled:active:scale-100"
                style={{
                  background: '#fff',
                  border: `1px solid ${C.border}`,
                  boxShadow: `0 2px 0 ${C.border}`,
                  opacity: isSold ? 0.6 : 1,
                  cursor: isSold ? 'not-allowed' : 'pointer',
                }}
              >
                <div
                  className="relative mb-[11px] flex aspect-square items-center justify-center overflow-hidden rounded-xl text-3xl"
                  style={{
                    background: 'repeating-linear-gradient(135deg,#efdcc0,#efdcc0 8px,#e9d3b2 8px,#e9d3b2 16px)',
                    filter: isSold ? 'grayscale(1)' : 'none',
                  }}
                  aria-hidden="true"
                >
                  🍕
                  {isSold ? (
                    <span
                      className="absolute inset-x-0 bottom-0 py-1 text-center uppercase"
                      style={{
                        background: 'rgba(58,36,24,0.82)',
                        color: C.cream,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                      }}
                    >
                      Sold out
                    </span>
                  ) : inCart[p.id] ? (
                    <span
                      className="absolute right-[7px] top-[7px] flex h-5 w-5 items-center justify-center rounded-full text-white"
                      style={{ background: C.green, fontSize: 10, fontWeight: 800 }}
                    >
                      {inCart[p.id]}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, lineHeight: 1.15 }}>{p.name}</div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span style={{ fontSize: 12.5, color: C.brown2, fontWeight: 600 }}>
                    {isSold ? 'Snapped up! 😋' : `from ${formatCurrency(p.price + minBasePrice)}`}
                  </span>
                  <span
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-lg leading-none"
                    style={{
                      background: isSold ? C.disabledBg : C.red,
                      color: isSold ? C.disabledFg : C.cream,
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    +
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-5 pb-3 pt-2 text-center">
        <p className="mx-auto" style={{ fontSize: 12.5, color: C.brown, fontWeight: 600, lineHeight: 1.5, maxWidth: 340 }}>
          Need a hand? Just call the waiter — they&apos;ll be at your table in a slice
          of a second. 🍕 We&apos;re here to help!
        </p>
        <a
          href="mailto:reachus@slicematic.in"
          className="mt-1.5 inline-block"
          style={{ fontSize: 12, color: C.red, fontWeight: 700 }}
        >
          reachus@slicematic.in
        </a>
      </footer>

      {/* STICKY CART BAR */}
      {hasCart && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[440px] px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3.5"
          style={{ background: `linear-gradient(rgba(251,245,234,0), ${C.cream} 45%)` }}
        >
          <button
            type="button"
            onClick={() => setSheet('cart')}
            className="flex w-full items-center justify-between rounded-2xl px-[18px] py-3.5"
            style={{ background: C.red, color: C.cream, boxShadow: '0 14px 30px rgba(197,52,28,0.34)' }}
          >
            <span className="flex items-center gap-2.5">
              <span
                className="flex h-[26px] min-w-[26px] items-center justify-center rounded-full px-[7px]"
                style={{ background: 'rgba(255,255,255,0.22)', fontSize: 13, fontWeight: 800 }}
              >
                {bill.totalQuantity}
              </span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                {bill.totalQuantity === 1 ? '1 pizza' : `${bill.totalQuantity} pizzas`} in cart
              </span>
            </span>
            <span className="flex items-center gap-2.5" style={{ fontWeight: 800, fontSize: 16 }}>
              {formatCurrency(bill.total)} <span style={{ fontSize: 15 }}>›</span>
            </span>
          </button>
        </div>
      )}

      {/* OVERLAYS */}
      <CustomizeSheet
        open={sheet === 'customize'}
        pizza={activePizza}
        bases={menu?.bases ?? []}
        toppings={menu?.toppings ?? []}
        pizzas={pizzas}
        soldOutBases={soldOut?.bases}
        soldOutToppings={soldOut?.toppings}
        soldOutPizzas={soldOut?.pizzas}
        taxConfig={taxConfig}
        cartTotalQty={bill?.totalQuantity ?? 0}
        onClose={() => setSheet(null)}
        onAdd={handleAdd}
        onApplyPizza={handleApplyCustomizePizza}
      />

      <CartSheet
        open={sheet === 'cart'}
        bill={bill}
        table={table}
        label={label}
        customer={customer}
        custErrors={custErrors}
        payment={payment}
        taxConfig={taxConfig}
        cartTotalQty={bill?.totalQuantity ?? 0}
        onClose={() => setSheet(null)}
        onQty={onQty}
        onRemove={handleRemove}
        onCustChange={onCustChange}
        onCustBlur={onCustBlur}
        onPayment={onPayment}
        onReview={handleReview}
        onClear={handleClear}
      />

      <ReviewModal
        open={showReview}
        bill={bill}
        table={table}
        label={label}
        name={customer.name}
        payment={payment}
        taxConfig={taxConfig}
        busy={submitting}
        error={submitError}
        onCancel={() => setShowReview(false)}
        onConfirm={handleConfirm}
      />

      {/* Saving overlay — covers everything (incl. the review modal) while the
          order is being saved, then hands off to the success screen. */}
      {submitting && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center" style={{ background: C.cream }}>
          <PizzaLoader variant="inline" quips={SAVING_QUIPS} />
        </div>
      )}
    </div>
  )
}
