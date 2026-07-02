import { Card, CardHeader, CardTitle, CardContent, Table, THead, TH, TR, TD } from '@/components/ui/primitives'
import { formatCurrency, GST_RATE } from '@/lib/billing'

/**
 * Step 3 — The order (cart). Lists every combo added, each with an inline
 * quantity stepper and a remove control, then the aggregate itemised bill.
 * `order` is the single source of truth from billing.computeOrderBill — the UI
 * never re-does the math here.
 */
export default function OrderSummary({ order, onUpdateQty, onRemove }) {
  const hasItems = order && order.lines.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Your order</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasItems ? (
          <p className="text-sm text-muted-foreground">
            No pizzas yet. Build a combo on the left and press{' '}
            <span className="font-medium text-foreground">Add to order</span>.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {order.lines.map((line) => (
                <li
                  key={line.lineId}
                  className="rounded-md border border-border p-3"
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
                    <button
                      type="button"
                      onClick={() => onRemove(line.lineId)}
                      className="shrink-0 rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                      aria-label={`Remove ${line.pizza.name}`}
                    >
                      Remove
                    </button>
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
                </li>
              ))}
            </ul>

            {/* Aggregate itemised bill for the whole order */}
            <Table>
              <THead>
                <TR>
                  <TH>Bill</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <tbody>
                <LineRow
                  label={`Subtotal (${order.totalQuantity} pizza${order.totalQuantity === 1 ? '' : 's'})`}
                  value={order.subtotal}
                  strong
                />
                {order.discountApplied && (
                  <LineRow
                    label="Discount (10% on qualifying combos)"
                    value={-order.discount}
                    className="text-brand-dark"
                  />
                )}
                <LineRow
                  label={`GST (${GST_RATE * 100}% on post-discount)`}
                  value={order.gst}
                />
                <TR className="border-t-2 border-foreground/20">
                  <TD className="py-3 text-base font-bold">Total payable</TD>
                  <TD className="py-3 text-right text-lg font-extrabold tabular-nums text-brand-dark">
                    {formatCurrency(order.total)}
                  </TD>
                </TR>
              </tbody>
            </Table>
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
