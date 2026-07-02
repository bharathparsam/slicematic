# CLAUDE.md — SliceMatic

Guidance for Claude Code (and humans) working in this repo. Read this before making changes.

## What this is

A React MVP replacing a pizza shop's Google Form ordering system.
**Client:** Rajan Sharma, owner of *SliceMatic*, a single-outlet pizza delivery
business in Delhi. Built as a classroom/FDE project and demoed live.

This is **Stage 1: a front-end-only MVP.** There is **no backend yet** — state
lives in React and orders persist to `localStorage`. Supabase (DB + Auth) and an
AI "COO" insights feature come in later stages. **Do not add a backend or
external calls unless a task explicitly asks for that stage.**

## Tech stack

- **Vite + React** (JavaScript, not TypeScript)
- **Tailwind CSS v3** (config in `tailwind.config.js`, directives in `src/index.css`)
- **shadcn/ui idiom** — the primitives in `src/components/ui/primitives.jsx` are
  hand-built in shadcn's style (not the CLI) to keep the MVP dependency-light and
  offline-reproducible. Match that style if you add primitives.
- **Vitest** for unit tests
- No router — two views (`Order` / `Admin`) via a state toggle in `App.jsx`.

## Commands

```bash
npm install       # once
npm run dev       # dev server → http://localhost:5173
npm run build     # production build (must stay green)
npm test          # vitest run — 24 tests over the pure lib/ logic
```

Admin tab placeholder password: `slice123` (client-side gate only — real auth is a later Supabase stage).

## Architecture — the important rule

**Business logic lives in `src/lib/`, not in components.** Every function there is
small, pure, side-effect-free, and independently unit-tested. Components render and
wire events; they do not do math or parsing. Keep it that way — it's what makes the
flow explainable line-by-line in a live Q&A.

```
src/
  lib/
    menuLoader.js   # fetch + DEFENSIVE parse of the 3 .txt files. Never hardcode menu items.
    validators.js   # validateName / validatePhone / validateQuantity → {valid, error}
    billing.js      # unitPrice → subtotal → discount → gst → finalTotal (all pure)
    orderStore.js   # localStorage seam. THE ONLY file that touches localStorage.
    utils.js        # cn() classname helper
  components/
    CustomerIntakeForm · MenuSelector · OrderSummary · PaymentSelector · AdminOrdersTable
    ui/primitives.jsx   # shadcn-styled Button/Input/Card/Table/Label/FieldError
  App.jsx           # orchestrates the whole flow + tab toggle
```

### Two seams to respect
- **`orderStore.js` is the persistence seam.** Components must NEVER touch
  `localStorage` directly — go through `saveOrder()` / `getAllOrders()` /
  `clearOrders()`. Migrating to Supabase later should touch *only this file*
  (swap the bodies for async `supabase.from('orders')…` and `await` the callers).
- **`menuLoader.js` is the data seam.** The three menu files are fetched from
  `public/data/*.txt` at runtime and parsed defensively. **These files get swapped
  out before grading**, so the app must reflect whatever they contain — never
  hardcode menu items, prices, or counts anywhere.

## Domain rules (do not silently change these)

- **One combo per order, with a quantity** — one base, one pizza, zero+ toppings,
  then a quantity (1–10). This is deliberately NOT a multi-item cart; discount and
  quantity are per-order per the Stage 2 spec.
- **Validation:** name = letters + spaces only, 2–40 chars; phone = exactly 10
  digits starting 6/7/8/9; quantity = integer 1–10.
- **Billing math (in `billing.js`):**
  - `unitPrice` = base + pizza + all selected toppings
  - `subtotal` = unitPrice × quantity
  - `discount` = 10% of subtotal, **only when quantity ≥ 5**, else 0
  - **`gst` = 18% of the POST-discount amount** = `0.18 × (subtotal − discount)`.
    This is the calculation reviewers ask about — GST is NOT on the raw subtotal.
  - `finalTotal` = subtotal − discount + gst
  - All money is rounded to 2 dp via `round2`.
- **Defensive menu parsing:** trim every field, skip blank lines, require exactly
  3 `;`-separated fields, price must parse as a finite positive number. Malformed
  lines are skipped with a `console.warn` — never crash. If a whole file fails
  (404/empty/unparseable), the UI shows an error state with Retry.

## The 8 edge cases (all must stay crash-free)

Only-spaces name · phone starting with 1 · quantity 0 or 11 · no base/pizza on
submit · empty name/phone · non-integer/empty quantity · missing/malformed `.txt`
file · rapid double-click (guarded by a synchronous `submittingRef` + disabled
button + idempotent `saveOrder` deduping by `id`).

If you change validation, billing, or the store, update `src/lib/__tests__/logic.test.js`
and keep `npm test` green.

## Priorities when improving the UI

1. Functional correctness + the 8 edge cases first.
2. Accessibility (this is tablet counter-staff software): labels, keyboard nav,
   visible focus, contrast, `aria-invalid`/`aria-describedby` on errored fields.
3. Visual polish.
4. Animation last — keep it light.

## Conventions

- JavaScript + JSX, 2-space indent, single quotes, no semicolons (match existing files).
- Import via the `@/` alias (→ `src/`).
- Don't commit `node_modules/`, `dist/`, or `.next/` (see `.gitignore`).
