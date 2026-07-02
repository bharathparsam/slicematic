## Context

I'm building a replacement for a pizza shop's Google Form ordering system, as part of a client
project (client: Rajan Sharma, owner of SliceMatic, a single-outlet pizza delivery business in
Delhi). This will later be deployed to Vercel with a Supabase backend and an AI "COO" insights
feature — but **this first build is a React MVP**: local state/localStorage only, no backend yet.
Structure the code so swapping localStorage for Supabase later touches only one layer, not the UI.

Correctness and defensive handling matter more than visual polish right now — but keep it clean
and usable, since this will be demoed live to a "client" in a classroom setting.

---

## Tech Stack

- Vite + React (JavaScript, not TypeScript, unless you think TS meaningfully reduces bugs here)
- Tailwind CSS
- shadcn/ui for form inputs, buttons, tables, dialogs
- No routing library needed unless it's cleaner — two views: `/` (ordering) and `/admin`
  (order list). A simple tab/state toggle is fine too.

---

## Data Files

Three files, format `ID;Name;Price` per line, one item per line. I'll place them in `public/data/`:

- `Types_of_Base.txt`
- `Types_of_Pizza.txt`
- `Types_of_Toppings.txt`

**Requirements:**
- Fetch and parse these at runtime (via `fetch()` against `/data/...txt`) — **do not hardcode menu
  items anywhere in the code.** These files will be swapped out before grading, so the app must
  reflect whatever is in them.
- Defensive parsing: trim whitespace on every field, skip blank lines, validate that price parses
  as a positive number. If a line is malformed (missing field, non-numeric price), skip that line
  and log a console warning — don't crash the app.
- If a file fails to load entirely (404, empty, unparseable), show a clear on-screen error state
  instead of a blank/broken UI.

---

## Order Model (important — read carefully)

This is **one combo per order, with a quantity** — not a multi-item shopping cart. A customer
picks exactly one base, one pizza, and zero or more toppings, then a quantity (how many of that
exact combo they want). This matches the Stage 2 spec's "Pizza Quantity" and discount rules, which
are defined per-order, not per-line-item.

(Note this as a deliberate scope decision if asked — a real shop would eventually want a
multi-item cart, but that's out of scope for this MVP.)

---

## Screens & Flow

### 1. Customer Intake
- Name: alphabets and spaces only, 2–40 characters
- Phone: exactly 10 digits, must start with 6/7/8/9
- Inline validation errors, not alerts — re-editable, doesn't block the rest of the form from
  being visible
- Capture a session timestamp when the form starts

### 2. Menu Selection
- Base: single-select, radio group or select dropdown, numbered/labeled with price
- Pizza: single-select, same treatment
- Toppings: multi-select (checkboxes), each with its own price
- Quantity: integer input, 1–10 only
  - Reject 0, negative, >10, non-integers, empty — clear inline error, no crash
  - When quantity ≥ 5, automatically show a 10% discount line — don't make the user do anything
    to trigger it

### 3. Order Summary / Bill
Show an itemized breakdown, clearly formatted (use a table, not a wall of text):
- Base name + price
- Pizza name + price
- Each topping name + price
- Unit price (sum of the above)
- Quantity
- Subtotal (unit price × quantity)
- Discount line (10% of subtotal, only if qty ≥ 5 — show ₹0 or hide if not applicable, your call,
  but be consistent)
- GST: 18% calculated on the **post-discount** total (subtotal − discount), not on the raw subtotal
- Final payable amount, visually distinct (bold/larger)

### 4. Payment
- Exactly three options: Cash, Card, UPI (radio or button group)
- Confirmation message on selection
- Reject/block submission if none selected

### 5. Order Persistence
- On "Confirm Order," write a complete order record to `localStorage` under a single key holding
  an array of order objects (e.g. `slicematic_orders`)
- Each record must include: timestamp, customer name, phone, base/pizza/toppings selected (with
  their individual prices), quantity, subtotal, discount amount, GST amount, final total, payment
  mode
- Wrap all read/write calls to this store in a small module (e.g. `src/lib/orderStore.js`) with
  functions like `saveOrder(order)`, `getAllOrders()` — this is the seam that gets swapped for
  Supabase calls later, so keep the interface clean and don't let components touch `localStorage`
  directly

### 6. Admin View (`/admin` or an admin tab)
- No real auth needed yet (that comes with Supabase Auth in Stage 3) — a simple client-side
  password gate or just an unlocked view is fine, note it as a placeholder
- Table of all orders: customer name, items (short summary), quantity, total, payment mode,
  timestamp — most recent first

---

## Edge Cases — all 8 must be handled without a crash or unhandled state

1. Name field containing only spaces
2. Phone number starting with 1 (10 digits, otherwise valid, but wrong first digit)
3. Quantity = 0 and quantity = 11
4. No base/pizza selected when trying to submit
5. Submitting with empty name/phone fields
6. Non-integer or empty quantity input
7. A menu `.txt` file missing or with a malformed price on some line
8. Rapid re-submission — make sure the same order can't get double-logged from a double-click

---

## Code Organization

Keep business logic out of components so it's easy to explain and defend line-by-line in a live
Q&A (I will be asked to walk through the GST calculation function specifically):

```
src/
  lib/
    menuLoader.js      # fetch + parse the 3 txt files, defensive parsing
    validators.js       # name, phone, quantity validation functions
    billing.js           # unit price, subtotal, discount, GST, total calculations
    orderStore.js        # localStorage read/write, swappable for Supabase later
  components/
    CustomerIntakeForm.jsx
    MenuSelector.jsx
    OrderSummary.jsx
    PaymentSelector.jsx
    AdminOrdersTable.jsx
  App.jsx
```

Each function in `billing.js` and `validators.js` should be small, pure, and independently
testable — no side effects, no DOM access. I want to be able to point at one function and explain
exactly what it does.

---

## On Skills / Polish

I have several skills available locally (ui-ux-pro-max, accessibility, shadcn, framer-motion-animator,
impeccable). Use them, but in this priority order:

1. **Functional correctness first.** All validation rules and edge cases above must work before
   any visual polish. A broken form with nice animations is worse than a plain form that never
   crashes.
2. **Accessibility is not optional here** — this is a form-heavy tool counter staff will use
   repeatedly on a tablet. Proper labels, keyboard navigation, visible focus states, and sufficient
   contrast on all inputs and the admin table.
3. **UI/UX polish** (spacing, typography, visual hierarchy) — apply once the flow works end-to-end.
4. **Animation (framer-motion) is explicitly lowest priority** — hold off on transitions/micro-
   interactions until the functional flow and edge cases are solid. If there's time left after
   that, light transitions on the order confirmation and bill reveal are a nice demo-day touch,
   but don't let this become the first thing that gets built.

## Deliverable

A working Vite React app I can run with `npm run dev`, that completes the full flow above
end-to-end with no crashes on any of the edge cases, plus a working admin view. Don't worry about
Vercel deployment or Supabase yet — that's the next phase.