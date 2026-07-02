import { Card, CardHeader, CardTitle, CardDescription, CardContent, Label, Input, FieldError } from '@/components/ui/primitives'

/**
 * Step 1 — Customer intake. Fully controlled by App. Inline validation errors
 * (via `errors`) never block the rest of the form from rendering.
 */
export default function CustomerIntakeForm({ values, errors, onChange, onBlur }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Customer details</CardTitle>
        <CardDescription>Who's this order for?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="cust-name" required>
            Name
          </Label>
          <Input
            id="cust-name"
            name="name"
            autoComplete="name"
            placeholder="e.g. Rajan Sharma"
            value={values.name}
            invalid={!!errors.name}
            aria-describedby={errors.name ? 'cust-name-error' : undefined}
            onChange={(e) => onChange('name', e.target.value)}
            onBlur={() => onBlur('name')}
          />
          <FieldError id="cust-name-error">{errors.name}</FieldError>
        </div>

        <div>
          <Label htmlFor="cust-phone" required>
            Phone
          </Label>
          <Input
            id="cust-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            placeholder="10-digit mobile"
            value={values.phone}
            invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'cust-phone-error' : undefined}
            onChange={(e) => onChange('phone', e.target.value.replace(/\D/g, ''))}
            onBlur={() => onBlur('phone')}
          />
          <FieldError id="cust-phone-error">{errors.phone}</FieldError>
        </div>
      </CardContent>
    </Card>
  )
}
