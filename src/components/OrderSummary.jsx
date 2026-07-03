import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TH, TR, TD, FieldError } from '@/components/ui/primitives'
import { formatCurrency, round2 } from '@/lib/billing'
import { DEFAULT_TAX_CONFIG } from '@/lib/taxConfig'

const pct = (r) => `${+(r * 100).toFixed(2)}%`

/** Shared itemised bill rows — used in cart summary, payment step, and receipt popup. */
export function BillBreakdown({
  bill,
  taxConfig = DEFAULT_TAX_CONFIG,
  className = '',
  variant = 'full',
}) {
  const { gst } = taxConfig
  const taxable = round2(bill.subtotal - bill.discount)

  if (variant === 'compact') {
    return (
      <dl className={`space-y-3 text-sm ${className}`}>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Price (before GST)</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(taxable)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">CGST ({pct(gst.cgst)})</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(bill.cgst)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">SGST ({pct(gst.sgst)})</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(bill.sgst)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <dt className="text-base font-bold">Total</dt>
          <dd className="text-lg font-extrabold tabular-nums text-brand-dark">
            {formatCurrency(bill.total)}
          </dd>
        </div>
      </dl>
    )
  }

  return (
    <div className={className}>
      <Table>
        <THead>
          <TR>
            <TH>Bill</TH>
            <TH className="text-right">Amount</TH>
          </TR>
        </THead>
        <tbody>
          <LineRow
            label={`Subtotal (${bill.totalQuantity} pizza${bill.totalQuantity === 1 ? '' : 's'})`}
            value={bill.subtotal}
            strong
          />
          {bill.discountApplied && (
            <LineRow
              label={`Discount (${pct(taxConfig.discount.rate)} — order of ${taxConfig.discount.minQuantity}+ pizzas)`}
              value={-bill.discount}
              className="text-brand-dark"
            />
          )}
          <LineRow label="Price (before GST)" value={taxable} />
          <LineRow label={`CGST (${pct(gst.cgst)})`} value={bill.cgst} />
          <LineRow label={`SGST (${pct(gst.sgst)})`} value={bill.sgst} />
          <TR className="border-t-2 border-foreground/20">
            <TD className="py-3 text-base font-bold">Total (incl. GST)</TD>
            <TD className="py-3 text-right text-lg font-extrabold tabular-nums text-brand-dark">
              {formatCurrency(bill.total)}
            </TD>
          </TR>
        </tbody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">
        {gst.label} {pct(gst.rate)} on the post-discount amount
        {gst.inputTaxCredit ? '' : ' · no input tax credit'}.
      </p>
    </div>
  )
}

/**
 * The order (cart). Lists every combo added, each with an inline quantity
 * stepper and a remove control, then the aggregate itemised bill. `order` is
 * the single source of truth from billing.computeOrderBill — the UI never
 * re-does the math here. GST labels/rates come from `taxConfig`.
 */
export default function OrderSummary({ order, taxConfig = DEFAULT_TAX_CONFIG, onUpdateQty, onRemove, onEdit, editingLineId = '', error }) {
  const hasItems = order && order.lines.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your order</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasItems ? (
          <>
            <p className="text-sm text-muted-foreground">
              No pizzas yet. Tap a pizza below, pick a base, then press{' '}
              <span className="font-medium text-foreground">Add to cart</span>.
            </p>
            <FieldError id="cart-error">{error}</FieldError>
          </>
        ) : (
          <>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
              {order.lines.map((line) => (
                <motion.li
                  key={line.lineId}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className={
                    'rounded-md border p-3 transition-colors ' +
                    (line.lineId === editingLineId
                      ? 'border-brand ring-1 ring-brand'
                      : 'border-border')
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">
                        {line.pizza.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {line.base.name}
                        {line.toppings.length > 0 &&
                          ' · ' + line.toppings.map((t) => t.name).join(', ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit?.(line.lineId)}
                        className="rounded px-2 py-1 text-xs font-medium text-brand-dark hover:bg-brand/10"
                        aria-label={`Edit ${line.pizza.name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(line.lineId)}
                        className="rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                        aria-label={`Remove ${line.pizza.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <QtyStepper
                      value={line.quantity}
                      onChange={(q) => onUpdateQty(line.lineId, q)}
                      label={line.pizza.name}
                    />
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(line.total)}
                      </p>
                      {line.discountApplied && (
                        <p className="text-xs font-medium text-brand-dark">
                          10% off applied
                        </p>
                      )}
                    </div>
                  </div>
                </motion.li>
              ))}
              </AnimatePresence>
            </ul>

            <BillBreakdown bill={order} taxConfig={taxConfig} />
          </>
        )}
      </CardContent>
    </Card>
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
        className="h-8 w-8 text-lg font-semibold text-foreground disabled:opacity-30"
      >
        −
      </button>
      <span
        className="w-8 text-center text-sm font-semibold tabular-nums"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= 10}
        aria-label={`Increase quantity of ${label}`}
        className="h-8 w-8 text-lg font-semibold text-foreground disabled:opacity-30"
      >
        +
      </button>
    </div>
  )
}

function LineRow({ label, value, strong, className = '' }) {
  return (
    <TR>
      <TD className={strong ? 'font-semibold' : ''}>{label}</TD>
      <TD
        className={`text-right tabular-nums ${strong ? 'font-semibold' : ''} ${className}`}
      >
        {formatCurrency(value)}
      </TD>
    </TR>
  )
}
