import { Card, CardHeader, CardTitle, CardDescription, CardContent, Label, Input, FieldError, Button } from '@/components/ui/primitives'
import { formatCurrency } from '@/lib/billing'

/**
 * Step 2 — Combo builder. Base (single), Pizza (single), Toppings (multi),
 * Quantity (1–10). "Add to order" pushes this combo into the cart so several
 * different pizzas can go on one order. Every price comes from the parsed .txt.
 */
export default function MenuSelector({
  menu,
  selection,
  errors,
  onSelectBase,
  onSelectPizza,
  onToggleTopping,
  onQuantityChange,
  onQuantityBlur,
  discountActive,
  onAddCombo,
  comboError,
  preview,
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Build a pizza</CardTitle>
        <CardDescription>
          One base, one pizza, any toppings — then add it to the order. Repeat to
          order several pizzas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Base — single select radio group */}
        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            Base <span className="text-destructive">*</span>
          </legend>
          <div
            role="radiogroup"
            aria-label="Pizza base"
            aria-describedby={errors.base ? 'base-error' : undefined}
            className="mt-2 grid gap-2 sm:grid-cols-2"
          >
            {menu.bases.map((b) => (
              <OptionRow
                key={b.id}
                type="radio"
                name="base"
                checked={selection.baseId === b.id}
                onChange={() => onSelectBase(b.id)}
                label={b.name}
                price={b.price}
              />
            ))}
          </div>
          <FieldError id="base-error">{errors.base}</FieldError>
        </fieldset>

        {/* Pizza — single select radio group */}
        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            Pizza <span className="text-destructive">*</span>
          </legend>
          <div
            role="radiogroup"
            aria-label="Pizza"
            aria-describedby={errors.pizza ? 'pizza-error' : undefined}
            className="mt-2 grid gap-2 sm:grid-cols-2"
          >
            {menu.pizzas.map((p) => (
              <OptionRow
                key={p.id}
                type="radio"
                name="pizza"
                checked={selection.pizzaId === p.id}
                onChange={() => onSelectPizza(p.id)}
                label={p.name}
                price={p.price}
              />
            ))}
          </div>
          <FieldError id="pizza-error">{errors.pizza}</FieldError>
        </fieldset>

        {/* Toppings — multi select checkboxes */}
        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            Toppings <span className="text-muted-foreground">(optional)</span>
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {menu.toppings.map((t) => (
              <OptionRow
                key={t.id}
                type="checkbox"
                name="topping"
                checked={selection.toppingIds.includes(t.id)}
                onChange={() => onToggleTopping(t.id)}
                label={t.name}
                price={t.price}
              />
            ))}
          </div>
        </fieldset>

        {/* Quantity */}
        <div className="max-w-[200px]">
          <Label htmlFor="qty" required>
            Quantity (1–10)
          </Label>
          <Input
            id="qty"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            step={1}
            value={selection.quantity}
            invalid={!!errors.quantity}
            aria-describedby={errors.quantity ? 'qty-error' : 'qty-help'}
            onChange={(e) => onQuantityChange(e.target.value)}
            onBlur={onQuantityBlur}
          />
          <FieldError id="qty-error">{errors.quantity}</FieldError>
          {!errors.quantity && (
            <p
              id="qty-help"
              className={
                discountActive
                  ? 'mt-1 text-sm font-medium text-brand-dark'
                  : 'mt-1 text-sm text-muted-foreground'
              }
            >
              {discountActive
                ? '🎉 10% bulk discount applies to this combo (5 or more).'
                : 'Order 5 or more of one combo for a 10% discount.'}
            </p>
          )}
        </div>

        {/* Add-to-order: live preview of this combo + the action button */}
        <div className="flex flex-col gap-3 rounded-md border border-dashed border-input bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {preview ? (
              <p className="text-muted-foreground">
                This combo:{' '}
                <span className="font-semibold text-foreground">
                  {formatCurrency(preview.unit)}
                </span>{' '}
                × {preview.quantity} ={' '}
                <span className="font-semibold text-foreground">
                  {formatCurrency(preview.total)}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">
                Pick a base, pizza and quantity to add.
              </p>
            )}
            <FieldError id="combo-error">{comboError}</FieldError>
          </div>
          <Button variant="outline" onClick={onAddCombo} className="shrink-0">
            + Add to order
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** A single selectable row with label + price, works as radio or checkbox. */
function OptionRow({ type, name, checked, onChange, label, price }) {
  return (
    <label
      className={
        'flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors ' +
        (checked
          ? 'border-brand bg-brand/5 ring-1 ring-brand'
          : 'border-input hover:bg-muted')
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
      <span className="tabular-nums text-muted-foreground">
        {formatCurrency(price)}
      </span>
    </label>
  )
}
