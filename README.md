# 🍕 SliceMatic

A React MVP replacing a Delhi pizza shop's Google Form ordering system. Customers
build one pizza combo (base + pizza + toppings + quantity), see an itemised bill
with bulk discount and GST, pick a payment method, and confirm. Staff review all
orders in an Admin view.

**Stage 1 — front-end only.** No backend: state is in React and orders persist to
`localStorage`. Supabase + an AI "COO" insights feature come in later stages.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

Other commands:

```bash
npm run build      # production build
npm test           # unit tests (Vitest) over the pure logic in src/lib
```

Admin tab uses a placeholder password: **`slice123`** (client-side gate only, not real auth).

## Menu data

The menu is **not hardcoded**. It is loaded at runtime from three files in
`public/data/`, one item per line as `ID;Name;Price`:

- `Types_of_Base.txt`
- `Types_of_Pizza.txt`
- `Types_of_Toppings.txt`

Swap these files to change the menu — the app reflects whatever they contain.
Malformed lines are skipped with a console warning; a fully broken file shows an
on-screen error with Retry.

## How it works (billing)

- **Unit price** = base + pizza + all selected toppings
- **Subtotal** = unit price × quantity
- **Discount** = 10% of subtotal, only when quantity ≥ 5
- **GST** = 18% of the **post-discount** amount (`subtotal − discount`)
- **Total** = subtotal − discount + GST

## Project structure

```
public/data/*.txt        Menu source files (swappable)
src/lib/                  Pure, tested business logic (parsing, validation, billing, storage)
src/components/           UI: intake, menu, summary, payment, admin + shadcn-style primitives
src/App.jsx              Flow orchestration + Order/Admin tab toggle
```

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, domain rules, and
conventions — read it before contributing (and it primes Claude Code for this repo).

## Tech

Vite · React · Tailwind CSS · shadcn/ui idiom · Vitest.
