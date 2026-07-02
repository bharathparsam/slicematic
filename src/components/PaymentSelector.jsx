import { Label, FieldError } from '@/components/ui/primitives'

const PAYMENT_MODES = ['Cash', 'Card', 'UPI']

/**
 * Step 4 — Payment. Exactly three options, none preselected. Submission is
 * blocked upstream until one is chosen (`errors.payment`).
 */
export default function PaymentSelector({ value, error, onChange }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground">
        Payment method <span className="text-destructive">*</span>
      </legend>
      <div
        role="radiogroup"
        aria-label="Payment method"
        aria-describedby={error ? 'payment-error' : undefined}
        className="mt-2 grid grid-cols-3 gap-2"
      >
        {PAYMENT_MODES.map((mode) => {
          const selected = value === mode
          return (
            <label
              key={mode}
              className={
                'flex cursor-pointer items-center justify-center rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors ' +
                (selected
                  ? 'border-brand bg-brand text-brand-foreground'
                  : 'border-input hover:bg-muted')
              }
            >
              <input
                type="radio"
                name="payment"
                value={mode}
                checked={selected}
                onChange={() => onChange(mode)}
                className="sr-only"
              />
              {mode}
            </label>
          )
        })}
      </div>
      <FieldError id="payment-error">{error}</FieldError>
      {value && !error && (
        <p className="mt-2 text-sm font-medium text-brand-dark" role="status">
          Paying by {value}.
        </p>
      )}
    </fieldset>
  )
}
