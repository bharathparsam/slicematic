// Lightweight shadcn/ui-styled primitives, hand-built to keep the MVP dependency-
// light and fully offline. Same visual idiom + accessibility posture as shadcn/ui
// (Radix-style focus rings, semantic elements, forwarded refs) without the CLI.
import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------- Button -------------------------------- */
const buttonVariants = {
  brand:
    'bg-brand text-brand-foreground hover:bg-brand-dark disabled:opacity-50 disabled:pointer-events-none',
  outline:
    'border border-input bg-background hover:bg-muted text-foreground disabled:opacity-50',
  ghost: 'hover:bg-muted text-foreground disabled:opacity-50',
  destructive:
    'bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50',
}

export const Button = forwardRef(function Button(
  { className, variant = 'brand', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors',
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  )
})

/* -------------------------------- Card --------------------------------- */
export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-background shadow-sm',
        className
      )}
      {...props}
    />
  )
}
export function CardHeader({ className, ...props }) {
  return <div className={cn('p-5 pb-3', className)} {...props} />
}
export function CardTitle({ className, ...props }) {
  return (
    <h2 className={cn('text-lg font-bold tracking-tight', className)} {...props} />
  )
}
export function CardDescription({ className, ...props }) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
}
export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-2', className)} {...props} />
}

/* -------------------------------- Label -------------------------------- */
export function Label({ className, required, children, ...props }) {
  return (
    <label
      className={cn('block text-sm font-medium text-foreground', className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
}

/* -------------------------------- Input -------------------------------- */
export const Input = forwardRef(function Input(
  { className, invalid, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-11 w-full rounded-md border bg-background px-3 py-2 text-base',
        'placeholder:text-muted-foreground',
        invalid ? 'border-destructive' : 'border-input',
        className
      )}
      {...props}
    />
  )
})

/* --------------------------- Inline field error ------------------------ */
export function FieldError({ id, children }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="mt-1 text-sm font-medium text-destructive">
      {children}
    </p>
  )
}

/* -------------------------------- Table -------------------------------- */
export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full border-collapse text-sm', className)}
        {...props}
      />
    </div>
  )
}
export function THead(props) {
  return <thead className="border-b border-border" {...props} />
}
export function TH({ className, ...props }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2.5 text-left font-semibold text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
export function TR({ className, ...props }) {
  return <tr className={cn('border-b border-border', className)} {...props} />
}
export function TD({ className, ...props }) {
  return <td className={cn('px-3 py-2.5 align-top', className)} {...props} />
}
