# CLAUDE.md — SliceMatic

Guidance for Claude Code (and humans) working in this repo. Read this before making changes.

## What this is

A React + Python/PostgreSQL app replacing a pizza shop's Google Form ordering system.
**Client:** Rajan Sharma, owner of *SliceMatic*, a single-outlet pizza delivery
business in Delhi. Built as a classroom/FDE project and demoed live.

It started as a front-end-only MVP (state in React, orders in `localStorage`) and
has grown into a small **restaurant operations system**: a FastAPI service over
PostgreSQL with four surfaces — **Order desk · Kitchen · Manager · Admin** — plus a
built **AI "COO"** layer (a daily brief + a natural-language → SQL analytics chat).
`localStorage` is gone; orders persist through the API and are also appended to a
flat-text `orders_log.txt`. Admin adds: analytics dashboard, menu availability
(sold-out toggles), table management, and staff/kitchen ops.

## Tech stack

**Frontend**
- **Vite + React** (JavaScript, not TypeScript)
- **Tailwind CSS v3** (config in `tailwind.config.js`, directives in `src/index.css`)
- **Framer Motion** for light animation (modals, view transitions)
- **shadcn/ui idiom** — the primitives in `src/components/ui/primitives.jsx` are
  hand-built in shadcn's style (not the CLI) to keep the app dependency-light and
  offline-reproducible. Match that style if you add primitives.
- **Vitest** for unit tests over the pure `lib/` logic
- No router — four views (`Order` / `Kitchen` / `Manager` / `Admin`) via a state
  toggle in `App.jsx` + a shared `ViewNav`.

**Backend** (`backend/`)
- **FastAPI** + **psycopg2** (Python 3.11+), Pydantic models for request/response
- **PostgreSQL 14+** (Supabase-ready); schema in `sql/schema.sql`
- **AI COO** in `backend/ai/` — a **LangGraph** pipeline calling **OpenRouter**
  (default `google/gemini-2.5-flash`) for the daily brief + guarded NL→SQL chat.

## Commands

```bash
npm install        # once (frontend deps)
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # production build (must stay green)
npm test           # vitest run — pure lib/ logic (59 tests)

npm run api:setup  # once — create backend/.venv + install Python deps
npm run api        # start FastAPI → http://localhost:8000 (docs at /docs)
npm run api:test   # backend pytest suite

npm run seed:demo -- --reset --orders 80 --days 14   # seed demo orders + kitchen flow
```

> **After a branch switch that changed `backend/requirements.txt`, re-run
> `npm run api:setup`** (or `pip install -r backend/requirements.txt`) — the AI
> deps (`openrouter`, `langgraph`, `sqlparse`) live there.
>
> To rebuild the flat-text log from the DB:
> `cd backend && ./.venv/bin/python -c "from order_log import rebuild_from_db; rebuild_from_db()"`

Full stack = two terminals (`npm run api` + `npm run dev`). In dev, Vite proxies
`/api` → `http://localhost:8000` (see `vite.config.js`), so no CORS setup is needed
locally. Set `VITE_API_URL` to point the frontend at another host (e.g. in Vercel).
The DB must exist and `sql/schema.sql` must be applied first — see `README.md` for
the full Postgres setup.

Admin portal is gated by **Supabase Auth** (email + password). Admin users are
created in Supabase → Authentication → Users; sign-in goes through `src/lib/auth.js`
(the auth seam) using `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (see
`.env.example`). The session persists in `localStorage` and survives the Modify
round-trip. NOTE: this gates the **UI**; the FastAPI endpoints are still
unauthenticated — verifying the Supabase JWT on the backend is the follow-up for
true end-to-end protection.

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
  lib/                # pure logic + API "store" seams (the ONLY place that fetches)
    menuLoader.js     # DEFENSIVE parse of the 3 .txt files. Never hardcode menu items.
    validators.js     # validateName / validatePhone / validateQuantity → {valid, error}
    billing.js        # unitPrice → subtotal → discount → gst → finalTotal + computeOrderBill (all pure)
    taxConfig.js      # GST + discount rates from /config/tax_config.json (defensive, self-defaulting)
    tablesLoader.js   # floor layout from /config/tables.json ; opsConfig.js # /config/ops_config.json
    orderStore.js     # orders seam (create/list/update/cancel/complete/rate + occupancy)
    tableStore.js     # tables seam (list/create/block/remove + mergeTablesWithState)
    menuStore.js      # menu-availability seam (sold-out per pizza/base/topping id)
    analyticsStore.js # READ-ONLY analytics seam (summary, sales_daily/range, top_products, …)
    cooStore.js       # AI seam — daily brief (get/generate) + Ask-COO chat
    kitchenStore.js   # kitchen queue + item transitions ; staffStore.js/adminStaffStore.js # staff
    suggestionStore.js# "Suggestion Bhayya" upsell picks ; analyticsFormat/Definitions.js # KPI formatting
    supabaseClient.js # supabase-js client ; auth.js # sign-in seam (admin) ; utils.js # cn()
  components/
    order/            # customer flow: OrderScreen, CustomizeSheet, CartSheet, ReviewModal,
                      #   DoneScreen, RateOrderSheet, SuggestionBhayya, PizzaLoader, BottomSheet
    TableSelect · ViewNav · StoreHoursBadge
    EmployeeBoard (Kitchen) · ManagerBoard · ManagerOrdersPanel · StaffLoginGate
    AdminOrdersTable (shell + Orders + pagination) · AdminAnalytics · AdminMenu · AdminTables · AdminStaff
    CooBriefing · CooChat · analytics/{AnalyticsCategoryStack,AnalyticsDetailCard}
    ui/primitives.jsx # shadcn-styled Button/Input/Card/Table/Label/FieldError
  App.jsx             # orchestrates the flow, table→order stage, modify round-trip, 4-view toggle
backend/
  main.py             # FastAPI app + thin routes (try/except → HTTP status mapping)
  models.py           # Pydantic request/response schemas (also validates name/phone/table/staff)
  queries.py          # ALL SQL + Decimal billing recompute + ensure_reporting_fresh(). Typed errors.
  db.py               # psycopg2 connection + db_cursor() context manager (commit/rollback)
  order_log.py        # append/rebuild the flat-text orders_log.txt (best-effort)
  kitchen.py          # item-status queue + transitions + roll-up ; suggestions.py # upsell engine
  analytics_summary.py# the 4-category ops dashboard payload (all pure SQL, no LLM)
  ai/
    chat_graph.py     # LangGraph NL→SQL→answer pipeline (with retry)
    sql_guard.py      # SELECT-only allowlist + store_id inject + LIMIT + reject writes/secrets
    briefing.py       # daily brief: KPI snapshot → LLM (+ deterministic fallback)
    llm.py            # OpenRouter client ; prompts/{coo_chat,coo_answer,coo_brief}.md
sql/schema.sql        # full Postgres schema: OLTP tables, kitchen/AI tables, seeds, reporting MVs
```

### The seams to respect
- **The `*Store.js` modules are the persistence seams** — `orderStore`, `tableStore`,
  `menuStore`, `analyticsStore`, `cooStore`, `kitchenStore`, `staffStore`,
  `adminStaffStore`, `suggestionStore`. Components must NEVER call `fetch`
  directly — go through these. Each exposes async functions returning `{ ok, ... }`
  results or safe empty fallbacks. `orderStore` maps UI order shape ↔ API JSON
  (`toCreatePayload` / `mapApiOrder`). Read seams self-default (never throw into UI);
  mutation seams return `{ ok:false, message }` on failure.
- **`menuLoader.js` is the menu-data seam.** The three menu files are fetched from
  `public/data/*.txt` at runtime and parsed defensively. **These files get swapped
  out before grading** — the app must reflect whatever they contain. Never hardcode
  menu items, prices, or counts anywhere.
- **`taxConfig.js` / `tablesLoader.js` are config seams** — same data-not-code
  pattern, both self-defaulting so a missing/broken file is non-fatal.

### Backend shape
- `main.py` routes are thin: call a `queries.py` / `kitchen.py` / `ai/` function,
  translate typed exceptions to HTTP (`OrderNotFoundError`→404,
  `OrderAlreadyTerminalError`/`TableAlreadyExistsError`/`TableInUseError`→409,
  `StaffNotFoundError`/`InvalidTransitionError`→404/409, `OperationalError`→503,
  `LLMError`→502/503, `ValueError`→422). Helpers `_db_unavailable` / `_llm_error`.
- `queries.py` owns every SQL statement and the Decimal money math (`round2`,
  `ROUND_HALF_UP`). It ensures the singleton store, upserts the customer by phone,
  allocates the **daily** `order_code` (`SM-0001`), manages table sessions, and
  exposes `ensure_reporting_fresh()` (throttled MV refresh — see AI notes).
- `analytics_summary.py` builds the dashboard payload from **live base tables**
  (always fresh). `ai/` reads the **`mv_*` materialized views** (must be refreshed).
- The DB is richer than the app strictly needs (multi-outlet, promotions, feedback,
  many MVs) — built to grow; the API touches the subset in use today.

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
  `public/config/tables.json` merged with `GET /api/tables` (`mergeTablesWithState`).
  Admin (**Tables** tab) can **add / remove / reserve** tables: `store_tables.is_active`
  (removed) and `is_blocked` (reserved). A **reserved** table shows a "Reserved" badge
  and a sweet funny nudge on the order desk; a **seated** table can't be removed.
- **Kitchen (item-level).** Each `order_items` row has its own status
  (`queued→assigned→preparing→ready→served`/`cancelled`) with timestamps + an
  append-only `order_item_status_events` log. The **Kitchen** board (`EmployeeBoard`)
  transitions items; the **order** status is a **roll-up** of its items (never set
  by employees directly). Powers prep-time + cancellation-stage analytics.
- **Staff.** `staff` table with a 4-digit `pin`. Kitchen/Manager views gate on a
  PIN picker (`StaffLoginGate` → `/api/staff/verify`); Admin manages staff. Every
  item transition logs `actor_staff_id`. (Distinct from Supabase admin auth.)
- **Menu availability (sold-out).** `menu_availability` keys a sold-out flag by the
  **`.txt` line id** (`P1`/`B1`/`T1`) + type — data-not-code, so it survives a menu
  swap. Admin (**Alter Menu** tab) toggles pizzas/bases/toppings; sold-out items are
  greyed + unselectable on the order desk. Seam: `menuStore.js`.
- **Guest ratings.** One 1–5 rating per order (`order_feedback`, `POST /api/rate_order`,
  `RateOrderSheet`). Surfaced in analytics + answerable by the COO chat.
- **Order codes.** `SM-0001` **resets daily per store** — constraint is
  `unique(store_id, business_date, order_code)`. Do NOT make `order_code` globally
  unique (day-2's SM-0001 would collide — this caused a prod outage; fixed).
- **Flat-text log.** Every placed order is also appended to `orders_log.txt`
  (`order_log.py`, best-effort) in addition to Postgres; DB stays the source of truth.
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
- **Ops + suggestions** also load from `public/config/ops_config.json`
  (prep SLA, poll interval) and `public/config/suggestion_config.json` — same
  data-not-code, self-defaulting pattern via `opsConfig.js` / `suggestionStore.js`.

## AI COO (`backend/ai/`) — decision support only

AI is used in **one place: interpretation**, never billing/discount/GST (those stay
deterministic). Two features, both via **OpenRouter** (default
`google/gemini-2.5-flash`; override with `OPENROUTER_MODEL` / `COO_BRIEF_MODEL` /
`COO_CHAT_MODEL`). Key is **server-side only** in `backend/.env`.

- **Daily COO Brief** (`briefing.py`, `CooBriefing`) — 3 sections (went well / didn't /
  to do) from a KPI snapshot; stored in `ai_briefings`. **Fallback:** deterministic
  bullets from the same JSON if the LLM is down.
- **Ask COO** (`chat_graph.py`, `CooChat`) — NL→SQL: LLM writes one `SELECT` →
  `sql_guard.py` (SELECT-only, allowlisted tables, `store_id` injected, `LIMIT`,
  reject writes/secrets) → read-only query → LLM phrases the answer. Never invents
  numbers. Prompts live in `ai/prompts/*.md` (version-controlled).

**Gotcha — MV freshness:** the chat reads `mv_*` materialized views (snapshots).
`run_chat` calls `ensure_reporting_fresh()` (throttled `refresh_reporting()`) so the
chat reflects live data — otherwise a correct query returns 0 rows → "no data". The
dashboard (`analytics_summary.py`) reads live base tables and needs no refresh.

**If the AI is unavailable the whole app still works** — this is a hard requirement.

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
- Secrets live in `backend/.env` (gitignored) — `DATABASE_URL`, `OPENROUTER_API_KEY`.
  Never commit real values. Prod `OPENROUTER_API_KEY` must be set in the host env
  (e.g. Render) separately — it's not read from the repo.
- Don't commit `node_modules/`, `dist/`, `.next/`, `backend/.venv/`, or the runtime
  `orders_log.txt` (see `.gitignore`).
- **Menu/prices/counts are never hardcoded** — verified by swapping the `.txt`
  files (incl. gibberish): the app reflects them and shows a Retry error on a fully
  broken file. Keep it that way.
