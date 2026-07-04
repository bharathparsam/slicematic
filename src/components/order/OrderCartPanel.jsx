import { formatCurrency } from '@/lib/billing'
import { Stepper } from './CustomizeSheet'
import { C, FONT_DISPLAY, shortName } from './theme'

const PAYMENTS = ['Cash', 'Card', 'UPI']

/**
 * Cart + checkout panel — used inline on wide screens and inside CartSheet on mobile.
 */
export default function OrderCartPanel({
  bill,
  table,
  label,
  customer,
  custErrors,
  payment,
  taxConfig,
  onQty,
  onRemove,
  onCustChange,
  onCustBlur,
  onPayment,
  onReview,
  compact = false,
  showFooter = true,
}) {
  const cgstPct = Math.round((taxConfig?.gst?.cgst ?? 0.09) * 100)
  const sgstPct = Math.round((taxConfig?.gst?.sgst ?? 0.09) * 100)
  const discPct = Math.round((taxConfig?.discount?.rate ?? 0.1) * 100)
  const hasLines = bill.lines.length > 0
  const pad = compact ? 'px-[22px]' : 'px-5'

  return (
    <div className="flex h-full flex-col">
      {!compact && (
        <div className={pad + ' pb-3 pt-1'}>
          <h2
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 400,
              fontSize: 22,
              margin: 0,
            }}
          >
            Your order
          </h2>
          <p style={{ fontSize: 14, color: C.brown2, margin: '4px 0 0', fontWeight: 600 }}>
            {label} {shortName(table, label)}
          </p>
        </div>
      )}

      <div className={'flex-1 overflow-y-auto noscroll ' + (compact ? '' : pad)}>
        {!hasLines ? (
          <div
            className={'rounded-2xl px-4 py-8 text-center ' + (compact ? 'mx-[22px] mt-1.5' : '')}
            style={{ background: '#fff', border: `1px dashed ${C.border2}` }}
          >
            <div className="text-3xl" aria-hidden="true">
              🍕
            </div>
            <p className="mt-3 font-semibold" style={{ color: C.ink, fontSize: 15 }}>
              Cart is empty
            </p>
            <p style={{ fontSize: 13, color: C.brown2, marginTop: 6 }}>
              Tap a pizza on the left to start building an order.
            </p>
          </div>
        ) : (
          <div className={'flex flex-col gap-2.5 ' + (compact ? 'px-[22px]' : '')}>
            {bill.lines.map((line) => {
              const sub = [line.base?.name, ...line.toppings.map((t) => t.name)]
                .filter(Boolean)
                .join(' · ')
              return (
                <div
                  key={line.lineId}
                  className="flex items-start gap-3 rounded-2xl p-3.5"
                  style={{ background: '#fff', border: `1px solid ${C.border}` }}
                >
                  <div className="min-w-0 flex-1">
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>
                      {line.pizza?.name}
                    </div>
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
                  <div
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontSize: 18,
                      color: C.red,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatCurrency(line.subtotal)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className={'pt-5 ' + (compact ? 'px-[22px]' : '')}>
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

        <div className={'pt-5 ' + (compact ? 'px-[22px]' : '')}>
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
                      ? {
                          background: C.red,
                          color: C.cream,
                          border: `2px solid ${C.red}`,
                          fontSize: 14,
                        }
                      : {
                          background: '#fff',
                          color: C.ink,
                          border: `1.5px solid ${C.border2}`,
                          fontSize: 14,
                        }
                  }
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {hasLines && (
          <div className={'pt-5 pb-4 ' + (compact ? 'px-[22px]' : '')}>
            <div
              className="rounded-2xl px-[18px] py-4"
              style={{ background: '#fff', border: `1px solid ${C.border}` }}
            >
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
        )}
      </div>

      {hasLines && showFooter && (
        <div
          className={
            (compact ? 'px-[22px] ' : pad + ' ') +
            'shrink-0 border-t py-4'
          }
          style={{ borderColor: C.border, background: C.cream }}
        >
          <button
            type="button"
            onClick={onReview}
            className="w-full rounded-[15px] py-4 font-bold transition-transform active:scale-[0.99]"
            style={{
              background: C.red,
              color: C.cream,
              fontSize: 16,
              boxShadow: '0 12px 26px rgba(197,52,28,0.3)',
            }}
          >
            Review · {formatCurrency(bill.total)}
          </button>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div
      className="mb-2.5 uppercase"
      style={{
        fontSize: 11,
        letterSpacing: '0.14em',
        fontWeight: 700,
        color: C.brown3,
      }}
    >
      {children}
    </div>
  )
}

function TotalRow({ label, value, color, last }) {
  return (
    <div
      className="flex justify-between"
      style={{ fontSize: 14, color: color ?? C.brown, marginBottom: last ? 12 : 9 }}
    >
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
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 px-1"
          style={{ fontSize: 12.5, color: C.red, fontWeight: 600 }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
