# CLAUDE.md — SliceMatic

Guidance for Claude Code (and humans) working in this repo. Read this before making changes.

## What this is

A React + Python/PostgreSQL app replacing a pizza shop's Google Form ordering system.
**Client:** Rajan Sharma, owner of *SliceMatic*, a single-outlet pizza delivery
business in Delhi. Built as a classroom/FDE project and demoed live.

It started as a front-end-only MVP (state in React, orders in `localStorage`) and
has since grown a **real backend**: a FastAPI service over PostgreSQL. The React
app now persists orders through that API — `localStorage` is gone. A later stage
adds an AI "COO" insights feature (the schema already carries the columns for it).

## Tech stack

**Frontend**
- **Vite + React** (JavaScript, not TypeScript)
- **Tailwind CSS v3** (config in `tailwind.config.js`, directives in `src/index.css`)
- **Framer Motion** for light animation (modals, view transitions)
- **shadcn/ui idiom** — the primitives in `src/components/ui/primitives.jsx` are
  hand-built in shadcn's style (not the CLI) to keep the app dependency-light and
  offline-reproducible. Match that style if you add primitives.
- **Vitest** for unit tests over the pure `lib/` logic
- No router — two views (`Order` / `Admin`) via a state toggle in `App.jsx`.

**Backend** (`backend/`)
- **FastAPI** + **psycopg2** (Python 3.11+), Pydantic models for request/response
- **PostgreSQL 14+** (Supabase-ready); schema in `sql/schema.sql`

## Commands

```bash
npm install        # once (frontend deps)
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # production build (must stay green)
npm test           # vitest run — pure lib/ logic (37 tests)

npm run api:setup  # once — create backend/.venv + install Python deps
npm run api        # start FastAPI → http://localhost:8000 (docs at /docs)
```

Full stack = two terminals (`npm run api` + `npm run dev`). In dev, Vite proxies
`/api` → `http://localhost:8000` (see `vite.config.js`), so no CORS setup is needed
locally. Set `VITE_API_URL` to point the frontend at another host (e.g. in Vercel).
The DB must exist and `sql/schema.sql` must be applied first — see `README.md` for
the full Postgres setup.

Admin tab placeholder password: `slice123` (client-side gate only — real auth is a
later Supabase stage).

## Architecture — the important rules

```
React (5173)  →  /api/* proxy  →  FastAPI (8000)  →  PostgreSQL (slicematic)
```

**Business logic lives in `src/lib/`, not in components.** Every function there is
small, pure, side-effect-free, and independently unit-tested. Components render and
wire events; they do not do math or parsing. The billing math is also mirrored in
the backend (`backend/queries.py::_compute_totals` / `create_order`) so the server
recomputes and stores authoritative totals — keep the two in sync. Keeping the pure
core intact is what makes the flow explainable line-by-line in a live Q&A.

```
src/
  lib/
    menuLoader.js     # fetch + DEFENSIVE parse of the 3 .txt files. Never hardcode menu items.
    validators.js     # validateName / validatePhone / validateQuantity → {valid, error}
    billing.js        # unitPrice → subtotal → discount → gst → finalTotal + computeOrderBill (all pure)
    taxConfig.js      # loads GST + discount rates from /config/tax_config.json (defensive, self-defaulting)
    tablesLoader.js   # loads the floor layout from /config/tables.json (defensive, self-defaulting)
    orderStore.js     # API seam for orders (create/list/update/cancel/complete + occupancy). THE ONLY file that fetches orders.
    tableStore.js     # API seam for dine-in tables (list/create + label merge/sort helpers)
    analyticsStore.js # READ-ONLY API seam for the 4 admin analytics endpoints
    utils.js          # cn() classname helper
  components/
    TableSelect · CustomerIntakeForm · MenuSelector · OrderSummary · PaymentSelector
    AdminOrdersTable · AdminAnalytics
    ui/primitives.jsx # shadcn-styled Button/Input/Card/Table/Label/FieldError
  App.jsx             # orchestrates the whole flow, the table→order stage, modify round-trip, tab toggle
backend/
  main.py             # FastAPI app + routes (thin; try/except → HTTP status mapping)
  models.py           # Pydantic request/response schemas (also validates name/phone/table)
  queries.py          # ALL SQL + the billing recompute. Raises typed errors main.py maps to 404/409/503.
  db.py               # psycopg2 connection + db_cursor() context manager (commit/rollback)
sql/schema.sql        # full Postgres schema: OLTP tables, status lookup, seeds, reporting materialized views
```

### The seams to respect
- **`orderStore.js` / `tableStore.js` / `analyticsStore.js` are the persistence
  seams.** Components must NEVER call `fetch` directly — go through these modules.
  Each exposes async functions returning `{ ok, ... }` results or safe empty
  fallbacks. `orderStore` maps between the UI order shape and the API JSON
  (`toCreatePayload` / `mapApiOrder`).
- **`menuLoader.js` is the menu-data seam.** The three menu files are fetched from
  `public/data/*.txt` at runtime and parsed defensively. **These files get swapped
  out before grading** — the app must reflect whatever they contain. Never hardcode
  menu items, prices, or counts anywhere.
- **`taxConfig.js` / `tablesLoader.js` are config seams** — same data-not-code
  pattern, both self-defaulting so a missing/broken file is non-fatal.

### Backend shape
- `main.py` routes are thin: call a `queries.py` function, translate its typed
  exceptions to HTTP (`OrderNotFoundError`→404, `OrderAlreadyTerminalError`→409,
  `TableAlreadyExistsError`→409, `OperationalError`→503).
- `queries.py` owns every SQL statement and the Decimal money math (`round2`,
  `ROUND_HALF_UP`). It also ensures the singleton store, upserts the customer by
  phone, allocates the daily `order_code` (`SM-0001`), and manages table sessions.
- The DB is far richer than the MVP uses (multi-outlet, staff, promotions,
  feedback, materialized views) — it's built to grow. The API touches only the
  subset the app needs today.

## Domain rules (do not silently change these)

- **Multi-combo order (cart).** An order = one customer + one-or-more combo line
  items + one payment + a table. Each combo = one base, one pizza, zero+ toppings,
  quantity 1–10. Customers build a combo and "Add to order", repeating for several
  pizzas. Re-adding the exact same base+pizza+topping-set merges into that line
  (qty bumped, capped at 10) instead of duplicating.
  - **Discount is gated by the cart-wide total quantity** (10% off when the order
    totals ≥ 5 pizzas across all lines). When it applies, it is calculated and
    shown **per line** (10% of each line's own subtotal). Documented in
    `billing.computeOrderBill`; `computeBill` still defaults to a per-line gate
    for standalone/preview use.
  - The saved order holds an `items[]` array; `quantity` on the record is the
    total pizzas across all lines.
- **Order lifecycle.** New orders are created `active` (DB status `placed`). Admin
  can **Complete** or **Cancel** an order (both terminal), or **Modify** it — which
  round-trips the saved order back into the Order builder, re-resolves each part's
  real price/id from the loaded menu by name (the DB snapshots line totals, not
  per-part prices), and PUTs a full replacement. Completing/cancelling frees the
  table (closes its session) once no open orders remain on it.
- **Tables.** An order is placed against a table. A table with an open (active)
  order is blocked in the picker until it's completed/cancelled. Tables come from
  `public/config/tables.json` merged with any added live via `POST /api/new_table`.
- **Validation** (enforced in BOTH `src/lib/validators.js` and `backend/models.py`):
  name = letters + spaces only, 2–40 chars; phone = exactly 10 digits starting
  6/7/8/9; quantity = integer 1–10 (frontend). Keep the two sides in agreement.
- **Billing math (in `billing.js`, mirrored in `queries.py`):**
  - `unitPrice` = base + pizza + all selected toppings
  - `subtotal` = unitPrice × quantity
  - `discount` = 10% of a line's subtotal, applied to every line **only when the
    order's total quantity ≥ 5** (the gate lives in `computeOrderBill`), else 0
  - **`gst` = GST rate × the POST-discount amount** = `rate × (subtotal − discount)`.
    This is the calculation reviewers ask about — GST is NOT on the raw subtotal.
    `gstBreakdown` splits it into CGST + SGST for the bill.
  - `finalTotal` = subtotal − discount + gst
  - All money rounded to 2 dp via `round2` (frontend) / Decimal `ROUND_HALF_UP`
    (backend). Postgres columns are `numeric(12,2)` — exact, no float drift.

## Config-driven rates (change the file, not the code)

- **GST + discount** load at runtime from `public/config/tax_config.json` via
  `taxConfig.js`. The file **currently sets 18% GST (9% CGST + 9% SGST)** and a 10%
  bulk discount at min-qty 5. (`gst.cgst + gst.sgst` MUST sum to `gst.rate`, else
  the parser warns and derives an even split.) The safe `DEFAULT_TAX_CONFIG` fallback is the 5%
  standalone-restaurant case (2.5% + 2.5%, no input tax credit) per
  [ClearTax](https://cleartax.in/s/impact-gst-food-services-restaurant-business);
  a hotel restaurant (tariff ≥ ₹7,500) or delivery aggregator is 18%. The rate is a
  **data choice** — edit the JSON, no rebuild. Billing functions take a `config`
  param and default to `DEFAULT_TAX_CONFIG`; a missing/invalid file self-defaults.
  > NB: the backend stores whatever GST amount the frontend sends per line; it does
  > not re-read `tax_config.json`. If you change the rate mid-flow, totals reflect
  > the value at order time (snapshotted), which is the intended behaviour.
- **Floor layout** loads from `public/config/tables.json` (`{count,label}` or an
  explicit `{tables:[...]}`), capped at 60, self-defaulting to 12 tables.

## Defensive parsing (never crash)

- **Menu (`menuLoader.js`):** trim every field, skip blank lines, require exactly
  3 `;`-separated fields, price must parse as a finite positive number. Malformed
  lines are skipped with a `console.warn`. If a whole file fails (404/empty/
  unparseable), the UI shows an error state with **Retry** (menu is required).
- **Config loaders** (`taxConfig`, `tablesLoader`) and the **read seams**
  (`getAllOrders`, `listTables`, analytics) log and fall back to safe defaults /
  empty — they never throw into the UI.

## The 8 edge cases (all must stay crash-free)

Only-spaces name · phone starting with 1 · quantity 0 or 11 · no base/pizza on
submit · empty name/phone · non-integer/empty quantity · missing/malformed `.txt`
file · rapid double-click (guarded by a synchronous `submittingRef` + disabled
button; the backend allocates the id so there's no client-dedup needed, but the
guard still prevents a double POST). API-down is also handled: save/update return
`{ ok:false, message }` and the UI surfaces it instead of crashing.

If you change validation, billing, or the store, update
`src/lib/__tests__/logic.test.js` and keep `npm test` green.

## Priorities when improving the UI

1. Functional correctness + the 8 edge cases first.
2. Accessibility (this is tablet counter-staff software): labels, keyboard nav,
   visible focus, contrast, `aria-invalid`/`aria-describedby` on errored fields,
   focus management in modals.
3. Visual polish.
4. Animation last — keep it light.

## Conventions

- **Frontend:** JavaScript + JSX, 2-space indent, single quotes, no semicolons
  (match existing files). Import via the `@/` alias (→ `src/`).
- **Backend:** Python, 4-space indent, single quotes, typed function signatures,
  Pydantic models for all request/response bodies. SQL lives only in `queries.py`.
- Secrets live in `backend/.env` (gitignored). Never commit real `DATABASE_URL`s.
- Don't commit `node_modules/`, `dist/`, `.next/`, or `backend/.venv/` (see `.gitignore`).
