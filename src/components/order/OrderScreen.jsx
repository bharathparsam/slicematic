import { useState } from 'react'
import { formatCurrency } from '@/lib/billing'
import CustomizeSheet from './CustomizeSheet'
import CartSheet from './CartSheet'
import ReviewModal from './ReviewModal'
import { C, FONT_DISPLAY, FONT_MONO, shortName } from './theme'

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
  onCustChange,
  onCustBlur,
  onPayment,
  validate,
  onConfirm,
  onChangeTable,
  onAdmin,
  onDiscardEdit,
}) {
  const [sheet, setSheet] = useState(null) // 'customize' | 'cart' | null
  const [activePizza, setActivePizza] = useState(null)
  const [showReview, setShowReview] = useState(false)

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

  function openCustomize(pizza) {
    setActivePizza(pizza)
    setSheet('customize')
  }
  function handleAdd(combo) {
    onAdd(combo)
    setSheet(null)
  }
  function handleRemove(lineId) {
    onRemove(lineId)
    if (bill.lines.length <= 1) setSheet(null) // removed the last item
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
        className="sticky top-0 z-30 flex items-center justify-between px-5 py-3"
        style={{ background: 'rgba(251,245,234,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
            style={{ background: C.red, boxShadow: '0 4px 12px rgba(197,52,28,0.28)' }}
          >
            <span style={{ fontFamily: FONT_DISPLAY, color: C.cream, fontSize: 19, lineHeight: 1 }}>S</span>
          </div>
          <div className="leading-tight">
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17 }}>SliceMatic</div>
            <div className="font-semibold uppercase" style={{ fontSize: 10, letterSpacing: '0.12em', color: C.gold }}>
              Order Desk
            </div>
          </div>
        </div>
        <div className="flex rounded-full p-[3px]" style={{ background: '#f0e5d2' }}>
          <span
            className="rounded-full px-[15px] py-1.5 font-bold"
            style={{ fontSize: 13, background: C.cream, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}
          >
            Order
          </span>
          <button
            type="button"
            onClick={onAdmin}
            className="rounded-full px-[15px] py-1.5 font-semibold"
            style={{ fontSize: 13, color: C.brown2 }}
          >
            Admin
          </button>
        </div>
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
        <div className="grid grid-cols-2 gap-3">
          {pizzas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openCustomize(p)}
              className="flex flex-col rounded-2xl p-[11px] text-left transition-transform active:scale-[0.98]"
              style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 2px 0 ${C.border}` }}
            >
              <div
                className="relative mb-[11px] flex aspect-square items-center justify-center overflow-hidden rounded-xl text-3xl"
                style={{ background: 'repeating-linear-gradient(135deg,#efdcc0,#efdcc0 8px,#e9d3b2 8px,#e9d3b2 16px)' }}
                aria-hidden="true"
              >
                🍕
                {inCart[p.id] ? (
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
                  from {formatCurrency(p.price + minBasePrice)}
                </span>
                <span
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-lg leading-none"
                  style={{ background: C.red, color: C.cream, fontSize: 18, fontWeight: 700 }}
                >
                  +
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

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
        taxConfig={taxConfig}
        onClose={() => setSheet(null)}
        onAdd={handleAdd}
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
        onClose={() => setSheet(null)}
        onQty={onQty}
        onRemove={handleRemove}
        onCustChange={onCustChange}
        onCustBlur={onCustBlur}
        onPayment={onPayment}
        onReview={handleReview}
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
    </div>
  )
}
