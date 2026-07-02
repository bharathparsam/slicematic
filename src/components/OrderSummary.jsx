import { Card, CardHeader, CardTitle, CardContent, Table, THead, TH, TR, TD } from '@/components/ui/primitives'
import { formatCurrency, GST_RATE } from '@/lib/billing'

/**
 * Step 3 — Itemised bill. Renders only when a base + pizza are chosen so the
 * numbers are always real. `bill` is the single computed source of truth from
 * billing.computeBill (the UI never re-does the math here).
 */
export default function OrderSummary({ base, pizza, toppings, bill }) {
  const ready = base && pizza && bill

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Order summary</CardTitle>
      </CardHeader>
      <CardContent>
        {!ready ? (
          <p className="text-sm text-muted-foreground">
            Pick a base and a pizza to see the bill.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <tbody>
              <LineRow label={`Base — ${base.name}`} value={base.price} />
              <LineRow label={`Pizza — ${pizza.name}`} value={pizza.price} />
              {toppings.map((t) => (
                <LineRow key={t.id} label={`Topping — ${t.name}`} value={t.price} />
              ))}

              <LineRow label="Unit price" value={bill.unit} strong />
              <LineRow label="Quantity" raw={`× ${bill.quantity}`} />
              <LineRow label="Subtotal" value={bill.subtotal} strong />

              {bill.discountApplied && (
                <LineRow
                  label="Discount (10%, qty ≥ 5)"
                  value={-bill.discount}
                  className="text-brand-dark"
                />
              )}

              <LineRow
                label={`GST (${GST_RATE * 100}% on post-discount)`}
                value={bill.gst}
              />

              <TR className="border-t-2 border-foreground/20">
                <TD className="py-3 text-base font-bold">Total payable</TD>
                <TD className="py-3 text-right text-lg font-extrabold tabular-nums text-brand-dark">
                  {formatCurrency(bill.total)}
                </TD>
              </TR>
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function LineRow({ label, value, raw, strong, className = '' }) {
  return (
    <TR>
      <TD className={strong ? 'font-semibold' : ''}>{label}</TD>
      <TD className={`text-right tabular-nums ${strong ? 'font-semibold' : ''} ${className}`}>
        {raw != null ? raw : formatCurrency(value)}
      </TD>
    </TR>
  )
}
