import { formatCurrency } from '@/lib/billing'
import BottomSheet, { SheetHeader, SheetFooter, SectionLabel } from './BottomSheet'
import { Stepper } from './CustomizeSheet'
import { C, FONT_DISPLAY, shortName } from './theme'

const PAYMENTS = ['Cash', 'Card', 'UPI']

/**
 * Cart / checkout sheet: editable line items, customer details (validated),
 * payment method, and the live GST-itemised totals — all from computeOrderBill
 * and the config-driven tax rates. "Review" hands off to the review modal.
 */
export default function CartSheet({
  open,
  bill,
  table,
  label,
  customer,
  custErrors,
  payment,
  taxConfig,
  onClose,
  onQty,
  onRemove,
  onCustChange,
  onCustBlur,
  onPayment,
  onReview,
  onClear,
}) {
  const cgstPct = Math.round((taxConfig?.gst?.cgst ?? 0.09) * 100)
  const sgstPct = Math.round((taxConfig?.gst?.sgst ?? 0.09) * 100)
  const discPct = Math.round((taxConfig?.discount?.rate ?? 0.1) * 100)

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="cart-title" maxHeight="94vh">
      <SheetHeader onClose={onClose}>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <h2 id="cart-title" style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 26, margin: 0 }}>
            Your order{' '}
            <span style={{ fontSize: 15, color: C.brown2, fontFamily: 'inherit', fontWeight: 600 }}>
              · {label} {shortName(table, label)}
            </span>
          </h2>
          {bill.lines.length > 0 && onClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear cart"
              className="flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 font-bold transition-colors active:scale-95"
              style={{ border: '1.5px solid #e9c3ba', background: '#fff', color: C.red, fontSize: 12.5 }}
            >
              <TrashIcon className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </SheetHeader>

      {/* Items */}
      <div className="flex flex-col gap-2.5 px-[22px] pt-1.5">
        {bill.lines.map((line) => {
          const sub = [line.base?.name, ...line.toppings.map((t) => t.name)].filter(Boolean).join(' · ')
          return (
            <div
              key={line.lineId}
              className="flex items-start gap-3 rounded-2xl p-3.5"
              style={{ background: '#fff', border: `1px solid ${C.border}` }}
            >
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>{line.pizza?.name}</div>
                <div className="mt-1" style={{ fontSize: 12.5, color: C.brown2, lineHeight: 1.4 }}>
                  {sub}
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <Stepper
                    qty={line.quantity}
                    size="sm"
                    onDec={() => onQty(line.lineId, line.quantity - 1)}
                    onInc={() => onQty(line.lineId, line.quantity + 1)}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(line.lineId)}
                    style={{ color: '#b0805a', fontSize: 12.5, fontWeight: 700 }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: C.red, whiteSpace: 'nowrap' }}>
                {formatCurrency(line.subtotal)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Details */}
      <div className="px-[22px] pt-[22px]">
        <SectionLabel>Your details</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <Field
            id="cust-name"
            placeholder="Name"
            value={customer.name}
            error={custErrors.name}
            onChange={(v) => onCustChange('name', v)}
            onBlur={() => onCustBlur('name')}
          />
          <Field
            id="cust-phone"
            placeholder="10-digit mobile"
            value={customer.phone}
            error={custErrors.phone}
            inputMode="numeric"
            maxLength={10}
            onChange={(v) => onCustChange('phone', v.replace(/\D/g, '').slice(0, 10))}
            onBlur={() => onCustBlur('phone')}
          />
        </div>
      </div>

      {/* Payment */}
      <div className="px-[22px] pt-5">
        <SectionLabel>Payment</SectionLabel>
        <div className="grid grid-cols-3 gap-2.5">
          {PAYMENTS.map((name) => {
            const sel = payment === name
            return (
              <button
                key={name}
                type="button"
                onClick={() => onPayment(name)}
                aria-pressed={sel}
                className="rounded-xl px-1.5 py-3 font-bold transition-colors"
                style={
                  sel
                    ? { background: C.red, color: C.cream, border: `2px solid ${C.red}`, fontSize: 14 }
                    : { background: '#fff', color: C.ink, border: `1.5px solid ${C.border2}`, fontSize: 14 }
                }
              >
                {name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Totals */}
      <div className="px-[22px] pt-5">
        <div className="rounded-2xl px-[18px] py-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <TotalRow label="Price (before GST)" value={formatCurrency(bill.subtotal)} />
          {bill.discount > 0 && (
            <TotalRow
              label={`Bulk discount (${discPct}%)`}
              value={`−${formatCurrency(bill.discount)}`}
              color={C.green}
            />
          )}
          <TotalRow label={`CGST (${cgstPct}%)`} value={formatCurrency(bill.cgst)} />
          <TotalRow label={`SGST (${sgstPct}%)`} value={formatCurrency(bill.sgst)} last />
          <div
            className="mt-3 flex items-baseline justify-between pt-3"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <span style={{ fontSize: 16, fontWeight: 800 }}>Total</span>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 24, color: C.red }}>
              {formatCurrency(bill.total)}
            </span>
          </div>
        </div>
      </div>

      <SheetFooter>
        <button
          type="button"
          onClick={onReview}
          className="w-full rounded-[15px] py-4 font-bold transition-transform active:scale-[0.99]"
          style={{ background: C.red, color: C.cream, fontSize: 16, boxShadow: '0 12px 26px rgba(197,52,28,0.3)' }}
        >
          Review · {formatCurrency(bill.total)}
        </button>
      </SheetFooter>
    </BottomSheet>
  )
}

function TrashIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h8a1 1 0 001-1V7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TotalRow({ label, value, color, last }) {
  return (
    <div className="flex justify-between" style={{ fontSize: 14, color: color ?? C.brown, marginBottom: last ? 12 : 9 }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function Field({ id, value, error, onChange, onBlur, placeholder, inputMode, maxLength }) {
  return (
    <div>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-full rounded-xl px-[15px] py-3.5"
        style={{
          border: `1.5px solid ${error ? C.red : C.border2}`,
          background: '#fff',
          fontSize: 15,
          color: C.ink,
        }}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 px-1" style={{ fontSize: 12.5, color: C.red, fontWeight: 600 }}>
          {error}
        </p>
      )}
    </div>
  )
}
