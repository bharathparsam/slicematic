# SliceMatic — Operations, Analytics & AI COO
## Team spec for build & vibe-coding

**Client:** Rajan Sharma, SliceMatic (single-outlet pizza, Delhi)  
**Audience:** Full team — read for context; use section-by-section for implementation prompts  
**Last updated:** July 2026

---

## 1. Why we're building this

Rajan replaced his Google Form with SliceMatic for **validated ordering and billing**. That fixed counter errors. It did **not** fix:

- Kitchen is a black box — no one knows what's queued, who's making what, or how long items take
- Tables sit occupied with no dwell-time insight
- He can't tell which **pizza** is slow vs which earns the most — so he can't make menu or staffing calls
- The Google Sheet was never queried; Rajan needs answers in plain language, not SQL

**Product shift:** Order capture → **restaurant operations system** with a thin analytics + AI layer on top.

**North star:** On a busy Saturday, Rajan can see in 30 seconds whether the problem is kitchen speed, table turns, or cancellations — and get 2–3 concrete actions for tomorrow. **Sales tells him if those actions are working** — it is not the primary diagnostic.

---

## 2. What already exists (fresh pull baseline)

Do **not** rebuild these — extend them.

| Area | Status | Key files |
|------|--------|-----------|
| Customer order flow | ✅ Redesigned UI (grid → customize → cart → review) | `src/components/order/*`, `src/App.jsx` |
| Billing, validation, tables | ✅ | `src/lib/billing.js`, `backend/queries.py` |
| Admin: orders list | ✅ Complete / cancel / modify | `src/components/AdminOrdersTable.jsx` |
| Admin: analytics | ✅ Sales-focused, 4 KPIs + charts | `src/components/AdminAnalytics.jsx`, `src/lib/analyticsStore.js` |
| Backend analytics API | ✅ 4 endpoints | `GET /api/analytics/*` in `backend/main.py` |
| Customers | ✅ `users` table (phone lookup) | `sql/schema.sql` |
| Staff table | ✅ Schema only — **unused** | `staff` in `sql/schema.sql` |
| Order lifecycle in DB | ✅ Full enum exists | `placed → preparing → ready → served → completed` |
| App order lifecycle | ⚠️ Simplified | Only `active` (placed) → completed / cancelled |
| Item-level status | ❌ Not built | — |
| Employee view | ❌ Not built | — |
| Table dwell / prep KPIs | ❌ MV exists, not exposed | `mv_table_turnover` in schema |
| AI summary / chat | ❌ Not built | — |

**App views today:** `Order` | `Admin` (password `slice123`)

**Target views:** `Order` | `Employee` | `Admin`

---

## 3. Architecture principles (keep these)

```
React → orderStore / kitchenStore / analyticsStore / cooStore (seams only)
     → FastAPI → PostgreSQL (+ read-only SQL role for COO chat)

Business logic stays in src/lib/ (pure, tested) and backend/queries.py (SQL + billing).
Components render and wire events — no fetch in components except via store modules.
Menu items: always from public/data/*.txt — never hardcode.
```

---

## 4. Feature sections

Each section has: **Functionality** · **Rationale** · **Technical changes**

---

### 4.1 People model — Staff vs customers

#### Functionality
- **Customers** stay on the existing `users` table (phone, name) — unchanged counter flow
- **Employees** (kitchen/counter staff) live in the existing `staff` table
- Three app entry points: **Order** (counter) · **Employee** (kitchen) · **Admin** (owner/manager)
- MVP employee auth: pick your name from a list or enter a 4-digit PIN (no Supabase Auth yet)
- Selected `staff_id` is sent on every assign/status API call and stored in event logs

#### Rationale
- Customers and employees are different entities with different jobs — don't merge into one `users` table with `user_type`
- Rajan needs to know **who** made/served a pizza when prep times are bad
- Schema already has `staff`; use it instead of inventing a new model
- Real auth (Supabase) is Stage 3 — PIN/name picker is enough for demo and vibe-coding speed

#### Technical changes

**Database**
```sql
-- Extend staff for demo auth (migration)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin char(4);  -- optional, nullable
-- Seed 3–4 staff rows for demo kitchen
INSERT INTO staff (store_id, full_name, role, pin) VALUES ...
```

**Backend**
- `GET /api/staff` — list active staff (id, full_name, role) for picker
- Optional: `POST /api/staff/login` — `{ pin }` → `{ staff_id, full_name }` or validate client-side against list

**Frontend**
- `src/lib/staffStore.js` — fetch staff list, persist selected staff in `sessionStorage`
- `App.jsx` — add `view` state: `'order' | 'employee' | 'admin'`
- Top-bar toggle on Order and Admin screens to reach Employee view
- New `src/components/EmployeeBoard.jsx` (or `employee/EmployeeScreen.jsx`)

**Do not**
- Add `user_type` to `users`
- Require Supabase Auth for employee MVP

---

### 4.2 Item-level kitchen operations (core)

#### Functionality
- Status lives on **`order_items`** (each cart line = one built pizza × quantity), **not** on the order header
- Per-item lifecycle:

  | Status | Meaning |
  |--------|---------|
  | `queued` | Order placed; item waiting |
  | `assigned` | Employee claimed it |
  | `preparing` | Actively being made |
  | `ready` | On pass / ready to serve |
  | `served` | Delivered to table |
  | `cancelled` | Line voided |

- **Employee board** shows a queue of **items** (grouped visually by table/order)
- Each item card: table label, order code, pizza name, base + toppings summary, qty, elapsed time since `queued`
- Actions:
  - **Pick** → `assigned` + set `assigned_staff_id`
  - **Start** → `preparing`
  - **Ready** → `ready`
  - **Served** → `served`
- Optional bulk: "Mark all items on this order ready" — still writes one event per item
- SLA badge: yellow/red if elapsed > configurable target (e.g. 12 min) from `ops_config.json`

#### Rationale
- Order-level status hides **which pizza** is slow — Rajan can't fix "kitchen is slow", he needs "Paneer Tikka is +5 min and it's our #2 seller"
- Item grain enables **prep time × revenue** matrix: protect slow-but-high-earners, drop slow-and-low-sellers
- One ticket per `order_items` row is enough for MVP (show qty on card; don't split qty into sub-tickets yet)
- Employees physically work pizza-by-pizza, not order-by-order

#### Technical changes

**Database — new tables + columns**
```sql
-- Lookup (mirror order_statuses pattern)
CREATE TABLE order_item_statuses (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE,  -- queued|assigned|preparing|ready|served|cancelled
  name text NOT NULL,
  sort_order smallint NOT NULL
);

-- Extend order_items
ALTER TABLE order_items
  ADD COLUMN status_id smallint REFERENCES order_item_statuses(id),
  ADD COLUMN assigned_staff_id bigint REFERENCES staff(id),
  ADD COLUMN queued_at timestamptz,
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN preparing_at timestamptz,
  ADD COLUMN ready_at timestamptz,
  ADD COLUMN served_at timestamptz;

-- Append-only audit log (powers prep-time analytics)
CREATE TABLE order_item_status_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_item_id bigint NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  from_status_id smallint REFERENCES order_item_statuses(id),
  to_status_id smallint NOT NULL REFERENCES order_item_statuses(id),
  actor_staff_id bigint REFERENCES staff(id),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_events_item ON order_item_status_events (order_item_id, occurred_at);
CREATE INDEX idx_order_items_status ON order_items (status_id);
```

**Seed statuses** (same codes as table above).

**On order create** (`backend/queries.py` → `create_order` / `_insert_order_items`):
- Set each new `order_items.status_id` = `queued`
- Set `queued_at = now()`
- Insert initial row in `order_item_status_events`

**Backend — new module `backend/kitchen.py` (or functions in `queries.py`)**
- `GET /api/kitchen/queue` — active items where status NOT IN (`served`, `cancelled`); join order, table, selections for display
- `POST /api/kitchen/items/{item_id}/assign` — body: `{ staff_id }` → `assigned`
- `POST /api/kitchen/items/{item_id}/transition` — body: `{ to_status, staff_id }` — validate allowed transitions; update timestamps; insert event; trigger order roll-up (§4.3)

**Frontend**
- `src/lib/kitchenStore.js` — `getQueue()`, `assignItem(id, staffId)`, `transitionItem(id, status, staffId)`
- `src/components/EmployeeBoard.jsx` — poll queue every 10–15s; large tap targets; show staff picker if none selected
- Reuse `src/components/order/theme.js` for visual consistency

**Config**
- `public/config/ops_config.json`:
  ```json
  { "prep_sla_minutes": 12, "queue_poll_ms": 12000 }
  ```
- Loader in `src/lib/opsConfig.js` (defensive, self-defaulting — same pattern as `taxConfig.js`)

**Tests**
- Backend: transition validation (can't go `queued` → `served` directly unless you allow)
- Frontend lib: none required for kitchen store; keep `npm test` green on billing/validators

---

### 4.3 Derived order status (roll-up only)

#### Functionality
- Order header status is **automatic** — employees never tap order-level buttons for kitchen flow
- Roll-up rules:
  - Any item `preparing` → order `preparing`
  - **All** items `ready` → order `ready`, set `orders.ready_at`
  - **All** items `served` → order `served`
  - Admin **Complete** still moves order → `completed` (payment done, frees table)
- Admin orders table shows derived kitchen state (e.g. "2/3 items ready")

#### Rationale
- Counter/admin cares about "is this table done?" — that's derived from items
- Avoid double-entry (item status + order status buttons)
- `order_status_events` + `orders.ready_at` stay useful for order-level KPIs (placed → ready)

#### Technical changes

**Backend**
- Function `rollup_order_status(cur, order_id)` called after every item transition:
  - Query item statuses for order
  - Compute target order status
  - If changed: update `orders.status_id`, insert `order_status_events` with `actor_staff_id`
  - Set `orders.ready_at` when first time all items ready

**Frontend**
- `orderStore.js` / `mapApiOrder` — expose item statuses if API returns them on list orders
- Admin orders table: optional column "Kitchen" showing e.g. `Preparing (1/2 ready)`

**Do not**
- Add employee-facing order-level status buttons

---

### 4.4 Analytics v2 — four expandable categories (≤10 KPIs)

#### Functionality
- Replace the current "all charts visible" layout with **4 category cards**
- Each card shows **one primary KPI** large and readable — the number Rajan cares about first
- Tap a category to **expand** and reveal detail cards underneath — collapsed by default
- **≤10 KPIs total** — no chart wall on first load

**Category display order (top → bottom)** — operations first, sales last:

| # | Category | Primary KPI (on card face) | Secondary line (on card face) | Expanded (detail cards below) |
|---|----------|----------------------------|-------------------------------|------------------------------|
| 1 | **Order times** | Avg item prep (min) | Slowest pizza name | Prep p90 · Backlog now · Ready→served · Prep×revenue matrix |
| 2 | **Cancellations** | Cancel rate % | Cancel count · top stage if clear | Revenue lost · Top cancelled items · Cancel stage breakdown · Last 5 cancels |
| 3 | **Table utilisation** | Avg dwell (min) | Sessions/table avg | Busiest table · Tables in use now |
| 4 | **Sales** | Net sales (7d) | Order count · ↑↓ vs prior week | Avg ticket · Payment mix · Top pizza |

**Why this order:** SliceMatic is not struggling to take orders — Rajan struggles with **running the floor and kitchen**. The first three categories surface problems and drive actions. **Sales is last** so he can see the **impact** of operational fixes (or confirm that slow prep / long dwell / cancels are costing revenue) — not lead with revenue charts he already roughly knows from the counter.

**Cancellations expand — detail breakdown**

| Detail card | What it shows | Why |
|-------------|---------------|-----|
| Revenue lost | Sum of `grand_total` on cancelled orders | Money impact |
| Top cancelled items | Top 3–5 pizzas (by `order_item_selections` where role = `pizza`) on cancelled orders or items with status `cancelled` | “Customers keep cancelling Paneer Tikka — menu issue or prep too slow?” |
| Cancel stage | Bar or list: % of cancels at `placed` / `preparing` / `ready` / `served` (last open status before cancel) | “Most cancels happen while still queued vs after long wait” → different fix |
| Recent cancels | Last 5 with order code, table, reason, stage | Quick audit |

**Cancel stage — definition**
- When admin cancels an order, record **stage at cancel** = the order’s status immediately before `cancelled` (from `order_status_events.from_status_id`, or snapshot column `cancelled_from_status_id` on `orders`)
- If individual **items** are voided mid-flow (item → `cancelled`), roll up to order-level stats using the item’s last status before cancel for item-level stage breakdown (optional v2); MVP: **order-level cancel stage** is enough for the dashboard

**Top cancelled items — definition**
- Count pizza selections on cancelled orders (`orders.status = cancelled`), grouped by pizza name
- Tie-break: also include lines where `order_items.status = cancelled` once item-level status exists (§4.2)
- Show units + % of total cancels

- **Prep × revenue matrix** lives inside **Order times** expand (4 quadrants):
  - Fast + high revenue → Promote
  - Slow + high revenue → Protect & optimize prep
  - Fast + low revenue → Stars
  - Slow + low revenue → Fix or drop

- Time window: 7 days default; compare vs prior 7d where useful (↑↓ on card face)

#### UI design — stacked category cards

Each collapsed category is a **stack**: the visible card is the “face”; 2–3 ghost cards peek out underneath to signal *“tap to see more”* without showing the data yet.

```
  ┌─────────────────────────────┐  ← face card (primary KPI + category label)
  │  ORDER TIMES                │
  │  11.2 min                   │  ← headline metric, FONT_DISPLAY ~32px
  │  Slowest: Paneer Tikka      │  ← secondary line, muted
  │  +0.8 min vs last week  ▾   │  ← trend + chevron
  └─────────────────────────────┘
    ┌───────────────────────────┐  ← stack layer 2 (offset +2px, scale 0.98, lower opacity)
      ┌─────────────────────────┐  ← stack layer 3 (offset +4px, scale 0.96)
```

**Collapsed (default)**
- 4 stacks in a **fixed vertical list** in ops-first order: Order times → Cancellations → Table utilisation → Sales
- On wide screens: same top-to-bottom priority (do **not** put Sales top-left in a 2×2 grid — ops categories always above sales)
- Face card: category icon + label, **primary KPI value**, secondary hint, week-over-week delta
- **Sales card:** same stack pattern but slightly muted treatment OK (softer border / secondary accent) — still tappable, not hidden
- **Stack affordance:** 2 pseudo-cards behind the face (CSS or Framer Motion), slightly offset down, narrower, ~40–60% opacity — reads as “more cards inside”
- Subtle idle animation: stack layers breathe (1–2px vertical float, 3s loop) — **disabled when `prefers-reduced-motion`**
- Footer hint on first visit only: “Tap a category for details” (dismissible)

**Expanded (one at a time — accordion)**
- Tap face card → stack **fans open**: face card stays on top; detail cards slide up from behind with stagger (80ms between cards)
- Only one category expanded at a time; opening another collapses the previous
- Expanded area contains smaller **detail cards** (Cancellations may have up to 4: revenue, top items, by stage, recent)
- Chevron rotates ▾ → ▴; `aria-expanded` on the trigger

**Visual priority**
- Primary KPI = largest type on the face (same weight as current `KpiCard` in admin)
- Category colour accent (reuse `C.red`, `C.gold`, etc.) — one accent per category for icon/border only, not color-only status

#### Rationale
- Rajan’s pain is **operations** (kitchen speed, cancels, table turns) — not “I need more charts about revenue”
- **Display order = decision order:** diagnose ops problems first (1–3), then check sales (4) to quantify impact or validate a fix
- Collapsed view = morning glance: **one ops number per problem area** before scrolling to sales
- Stack animation solves a UX problem: owners don't know the card is expandable unless we show depth — peering cards communicate “there's more here” without cluttering the face with mini-charts
- Item-level status events (§4.2) are **required** for order-time KPIs — without them show “—” on the face, still show the stack affordance
- **Cancel stage + top items** answer different questions: stage = *when* we lose orders; top items = *what* to fix on menu or prep
- **Sales expand** is the “so what?” — avg ticket and payment mix help interpret whether an ops fix moved the needle

#### Technical changes

**Database — new materialized view (or query)**
```sql
CREATE MATERIALIZED VIEW mv_item_prep_stats AS
SELECT
  o.store_id,
  sel.menu_unit_id,
  sel.item_name AS pizza_name,
  count(*) AS items_completed,
  round(avg(extract(epoch from (oi.ready_at - oi.queued_at)) / 60.0), 1) AS avg_prep_minutes,
  round(percentile_cont(0.9) WITHIN GROUP (
    ORDER BY extract(epoch from (oi.ready_at - oi.queued_at)) / 60.0
  )::numeric, 1) AS p90_prep_minutes
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN order_item_selections sel ON sel.order_item_id = oi.id AND sel.role = 'pizza'
JOIN order_statuses s ON s.id = o.status_id
WHERE oi.ready_at IS NOT NULL AND oi.queued_at IS NOT NULL
  AND s.is_settled
GROUP BY o.store_id, sel.menu_unit_id, sel.item_name;

-- Add to refresh_reporting()
```

**Database — cancellation analytics**
```sql
-- Top cancelled pizzas + cancel counts (order-level cancels)
CREATE MATERIALIZED VIEW mv_cancellation_items AS
SELECT
  o.store_id,
  sel.item_name AS pizza_name,
  count(DISTINCT o.id) AS cancelled_orders,
  sum(oi.quantity) AS cancelled_units
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN order_item_selections sel ON sel.order_item_id = oi.id AND sel.role = 'pizza'
JOIN order_statuses s ON s.id = o.status_id
WHERE s.is_cancelled
GROUP BY o.store_id, sel.item_name;

-- Stage at which orders were cancelled (from status event log)
CREATE MATERIALIZED VIEW mv_cancellation_stages AS
SELECT
  o.store_id,
  fs.code AS cancelled_from_stage,   -- placed | preparing | ready | served
  count(*) AS cancel_count
FROM orders o
JOIN order_statuses s ON s.id = o.status_id
JOIN order_status_events e ON e.order_id = o.id
JOIN order_statuses ts ON ts.id = e.to_status_id AND ts.code = 'cancelled'
LEFT JOIN order_statuses fs ON fs.id = e.from_status_id
WHERE s.is_cancelled
GROUP BY o.store_id, fs.code;

-- On cancel (queries.py cancel_order): ensure order_status_events
-- records from_status_id = current status before cancelled (already supported)
-- Optional snapshot for faster queries:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_from_status_id smallint
  REFERENCES order_statuses(id);
-- Set in cancel_order when status changes to cancelled
```

**Backend — cancellations payload** (`details` inside summary)
```json
"cancellations": {
  "primary": { "value": 4.2, "format": "percent" },
  "secondary": { "count": 3 },
  "details": {
    "revenue_lost": 2400,
    "top_items": [
      { "pizza_name": "Paneer Tikka", "cancelled_orders": 2, "cancelled_units": 3 }
    ],
    "by_stage": [
      { "stage": "preparing", "count": 2, "pct": 67 },
      { "stage": "placed", "count": 1, "pct": 33 }
    ],
    "recent": [
      { "order_code": "SM-0012", "table": "Table 5", "reason": "...", "stage": "preparing", "total": 899 }
    ]
  }
}
```

**Backend — new endpoints**
- `GET /api/analytics/summary?days=7` — single payload with all 4 categories (preferred for one UI fetch)
- Or split:
  - `GET /api/analytics/table_utilisation?days=7` — from `table_sessions` / `mv_table_turnover`
  - `GET /api/analytics/order_times?days=7` — from `order_items` timestamps + `mv_item_prep_stats`
  - `GET /api/analytics/cancellations?days=7`
  - `GET /api/analytics/product_matrix?days=7` — join prep stats + `mv_product_sales`

**Frontend**
- Refactor `src/components/AdminAnalytics.jsx`:
  - Layout order: **CooBriefing** → stacks in fixed order: `order_times`, `cancellations`, `table_utilisation`, `sales`
  - Render from `summary.category_order` if API provides it; else use constant `CATEGORY_ORDER` in frontend
  - Extract `src/components/analytics/AnalyticsCategoryStack.jsx` — reusable stack + expand
  - Extract `src/components/analytics/AnalyticsDetailCard.jsx` — small card for expanded KPIs
- `src/lib/analyticsStore.js` — add `getAnalyticsSummary(days)`

**`AnalyticsCategoryStack` props (vibe-coding contract)**
```jsx
<AnalyticsCategoryStack
  category="order_times"       // id for a11y
  label="Order times"
  icon="⏱"
  primaryValue="11.2 min"      // headline KPI
  secondaryLine="Slowest: Paneer Tikka"
  trend={{ delta: +0.8, unit: 'min', direction: 'up' }}  // 'up' bad for prep, good for sales
  trendSentiment="negative"    // per-category: prep up = bad, sales up = good
  expanded={openId === 'order_times'}
  onToggle={() => setOpenId(...)}
  stackDepth={2}               // ghost layers behind face (default 2)
>
  {/* detail cards / charts — only mounted when expanded */}
</AnalyticsCategoryStack>
```

**Stack animation (Framer Motion — already in project)**
- Collapsed: face `motion.div` + 2 absolute-positioned ghost divs (`scale: 0.98/0.96`, `y: 4/8`, `opacity: 0.5/0.35`)
- Idle: optional `animate={{ y: [0, -2, 0] }}` on ghost layers — use `useReducedMotion()` → skip
- Expand: `AnimatePresence` + `layout` — detail cards `initial={{ opacity: 0, y: 12 }}` `animate={{ opacity: 1, y: 0 }}` with staggerChildren
- Accordion: only one `expanded` id in `AdminAnalytics` state

**API shape for summary (supports card face + expand)**

Categories in response should follow the same **ops-first order** for predictable UI rendering:

```json
{
  "category_order": ["order_times", "cancellations", "table_utilisation", "sales"],
  "categories": {
    "order_times": {
      "primary": { "value": 11.2, "format": "minutes" },
      "secondary": { "slowest_pizza": "Paneer Tikka" },
      "trend": { "vs_prior_period": 0.8, "unit": "min", "sentiment": "negative" },
      "details": { "p90_prep_minutes": 18, "backlog_now": 4, "product_matrix": [...] }
    },
    "cancellations": { "primary": { "value": 4.2, "format": "percent" }, ... },
    "table_utilisation": { ... },
    "sales": {
      "primary": { "label": "Net sales", "value": 42300, "format": "currency" },
      "secondary": { "orders": 47 },
      "trend": { "vs_prior_period_pct": 8.2, "sentiment": "positive" },
      "details": { "avg_ticket": 899, "payment_mix": [...], "top_pizza": {...} }
    }
  }
}
```

**Keep from current dashboard (inside expands only)**
- Sales bars, payment donut, top pizzas — reuse existing subcomponents inside Sales expand
- `Orders per hour` → optional inside Sales expand or drop from v2

**Cancellations expand — UI**
- **Top cancelled items:** compact bar list (same pattern as Top pizzas), top 3–5
- **Cancel stage:** horizontal segmented bar or mini bar list — `% at Placed / Preparing / Ready / Served` with labels (not color-only)
- Surface top stage on card **secondary line** when clear winner, e.g. `Most at: Preparing (67%)`

---

### 4.5 AI daily summary (COO brief)

#### Functionality
- Card at top of **Admin → Analytics**: "Today's COO Brief"
- Always **three sections** (content priority: **ops → ops → action**, sales as supporting evidence):
  1. **What went well** — lead with ops wins (prep on target, low cancels, good table turns); mention sales only if it validates an ops fix
  2. **What didn't go well** — prep delays, cancel stage/items, dwell spikes first; revenue impact second (“cost ~₹X”)
  3. **What to do** — 2–3 actions from **order times, cancellations, table util, item mix**; optional “expect sales lift if…” tie-in
- Generated once per business day (after `day_cutoff` or ~11pm IST); stored for history
- **Ask follow-up** button on the brief → opens **COO Chat** (§4.6) with `briefing_id` + KPI snapshot pre-loaded
- **Fallback:** if OpenRouter is down, show deterministic bullets from KPI JSON (no LLM prose)

**Example output**
> **Went well:** Kitchen avg prep 9 min (−1 vs week). Table turnover steady — avg dwell 34 min. Only 1 cancel.  
> **Didn't:** Paneer Tikka prep 16 min (+5 vs week). 2 cancels at **preparing** — wait-related; Paneer Tikka in both. Table 7 dwell 52 min.  
> **Do:** Pre-prep Paneer Tikka before 7pm. Clear Table 7 faster after serve.  
> **Sales note:** Net ₹42,300 (+8% vs last Sat) — holding despite kitchen strain; fixing prep may protect this on busier nights.

#### Rationale
- Rajan won't run SQL or stare at 12 charts — he needs a **30-second brief** with **decisions**
- Brief narrative order mirrors analytics: **ops problems first**, sales as impact / validation — same as category stack order
- Assignment requires LLM via OpenRouter + documented system prompt in README
- Brief → chat handoff matches how owners work: read summary, ask one follow-up question

#### Technical changes

**Database**
```sql
CREATE TABLE ai_briefings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id bigint NOT NULL REFERENCES stores(id),
  business_date date NOT NULL,
  kpi_snapshot jsonb NOT NULL,
  summary_text text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, business_date)
);
```

**Backend — new module `backend/ai/`**
- `briefing.py`:
  - `aggregate_kpis(store_id, business_date)` → JSON (all §4.4 KPIs + top/slowest pizza from item prep)
  - `generate_briefing(snapshot)` → OpenRouter call with structured system prompt
  - `GET /api/coo/briefing/latest`
  - `POST /api/coo/briefing/generate` — manual trigger for demo
- `prompts/coo_brief.md` — system prompt (commit to repo; copy to README)
- Prompt rules: never invent numbers; only narrate provided JSON; ops suggestions must cite a KPI field

**Frontend**
- `src/lib/cooStore.js` — `getLatestBriefing()`, `generateBriefing()`
- `src/components/CooBriefing.jsx` — 3-section card above category cards in AdminAnalytics; **Ask follow-up** → opens CooChat (§4.6)

**Env**
- `OPENROUTER_API_KEY` in `backend/.env`
- Document model choice in README (e.g. `anthropic/claude-3.5-sonnet` or team preference)

---

### 4.6 AI chat — “Ask COO” (natural language → SQL)

#### Functionality

Rajan asks questions about his restaurant data in **plain language**. The system converts them to **read-only SQL** against the schema, runs the query, and answers with real numbers — no spreadsheet, no SQL knowledge required.

**Two entry points**
| Entry | When |
|-------|------|
| **Ask follow-up** on COO brief | After reading the daily summary — chat opens with that day’s KPI snapshot + brief text as context |
| **Ask COO** button (FAB or admin header) | Anytime in Admin — blank thread or continue last session |

**Example questions Rajan might ask**
- “Which hour was busiest last Saturday?”
- “How long did Table 5 stay occupied yesterday?”
- “Compare Farm House vs Pepperoni sales this week.”
- “Which pizzas are slow but sell a lot?”
- “How many orders cancelled while still preparing?”
- “What was our avg prep time on Friday 7–9pm?”

**Chat UX**
- Drawer or modal from the right (tablet-friendly); message list + input at bottom
- Assistant reply: short prose + optional compact table (≤10 rows) when query returns tabular data
- **Show SQL** toggle (collapsed by default) — for demo Q&A: “here’s the query it ran”
- Thumbs up/down on reply (optional; log for demo feedback)
- Thread persists in session (`thread_id` in `sessionStorage`); optional `ai_chat_messages` table for history

**What the assistant must not do**
- Invent numbers not returned by SQL
- Run writes, DDL, or multi-statement queries
- Expose secrets (auth IDs, payment refs) or answer off-topic questions — polite redirect to restaurant data

#### Rationale
- The brief gives Rajan **decisions**; chat gives **depth** when one bullet raises a question (“was that just Saturday or all week?”)
- Schema-backed SQL is **exact** — better for demo grading than RAG over order text (“explain your prompt / how does it get the number?”)
- Same OpenRouter integration as the brief — one AI story for assignment: **COO = brief + ask anything**
- Ops-first bias in prompt: prefer prep, cancel, table queries over pure sales when ambiguous

#### Technical changes

**Architecture**
```
User message (+ optional briefing context)
  → LLM: produce SQL (structured output or fenced block)
  → sql_guard.py: parse, allowlist tables, reject writes, inject store_id + LIMIT
  → Read-only DB cursor (5s timeout, max 500 rows)
  → LLM: format answer from JSON rows (numbers must match result set)
  → UI: display message + optional table
```

**SQL allowlist (read-only)**
| Allowed | Use for |
|---------|---------|
| `mv_daily_sales`, `mv_product_sales`, `mv_payment_mix`, `mv_table_turnover`, `mv_item_prep_stats`, `mv_cancellation_items`, `mv_cancellation_stages` | Aggregates — prefer these |
| `orders`, `order_items`, `order_item_selections`, `order_item_status_events` | Drill-down |
| `table_sessions`, `store_tables` | Dwell, table labels |
| `order_status_events` | Cancel stage, lifecycle |

**Denylist:** `staff.auth_user_id`, `payments.reference`, any `INSERT`/`UPDATE`/`DELETE`/`DROP`/`;`

**Guard rules (`backend/ai/sql_guard.py`)**
- Single `SELECT` only (no semicolon chaining)
- Must include `store_id = 1` (or param) — inject if missing
- Revenue queries: join `order_statuses` where `is_settled = true` unless user asks about cancels
- Append `LIMIT 500` if absent
- Reject subqueries to non-allowlisted tables

**Database (optional — chat history)**
```sql
CREATE TABLE ai_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id bigint NOT NULL REFERENCES stores(id),
  briefing_id bigint REFERENCES ai_briefings(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES ai_chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  sql_executed text,           -- audit / demo
  query_row_count int,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Backend — `backend/ai/chat.py`**
- `POST /api/coo/chat` — body:
  ```json
  {
    "message": "Which table had the longest dwell yesterday?",
    "thread_id": "uuid-or-null",
    "briefing_id": 123
  }
  ```
- Response:
  ```json
  {
    "thread_id": "uuid",
    "reply": "Table 7 had the longest dwell yesterday at 52 minutes...",
    "sql": "SELECT ...",
    "rows_preview": [{ "table_label": "Table 7", "dwell_minutes": 52 }],
    "row_count": 1
  }
  ```
- `GET /api/coo/chat/threads/{id}/messages` — optional, reload history
- `prompts/coo_chat.md` — system prompt: schema excerpt, allowlist, 8–10 few-shot Q→SQL examples, IST/`Asia/Kolkata`, INR formatting, ops-first tone
- Log every `sql_executed` server-side (demo accountability)

**Few-shot examples to include in prompt** (abbreviated)
```sql
-- Busiest hour last 7 days
SELECT order_hour, sum(orders_count) FROM mv_order_item_facts
WHERE store_id = 1 AND business_date >= current_date - 7
GROUP BY order_hour ORDER BY 2 DESC LIMIT 1;

-- Slowest pizza by avg prep
SELECT pizza_name, avg_prep_minutes FROM mv_item_prep_stats
WHERE store_id = 1 ORDER BY avg_prep_minutes DESC LIMIT 5;
```

**Frontend**
- `src/lib/cooStore.js` — add `sendChatMessage({ message, threadId, briefingId })`
- `src/components/CooChat.jsx` — drawer, message list, input, loading state, error banner
- Wire **Ask follow-up** in `CooBriefing.jsx` → `openChat({ briefingId, kpiSnapshot })`
- **Ask COO** FAB on `AdminAnalytics` or admin top bar (visible when admin unlocked)
- API/LLM down: “Couldn’t reach COO right now. Try Refresh on analytics or read today’s brief.”

**Fallback behaviour**
| Failure | User sees |
|---------|-----------|
| OpenRouter down | Cached brief still works; chat disabled with clear message |
| SQL guard rejects | “I can only answer questions about your restaurant data — try rephrasing.” |
| Empty result set | “No data for that period” — no fabricated numbers |
| Query timeout | “That question was too broad — try a shorter date range.” |

**README (assignment)**
- Document `coo_chat.md` prompt, model choice, allowlist approach, and fallback table above

#### Technical changes (env)
- Same `OPENROUTER_API_KEY` as §4.5
- Optional: `COO_CHAT_MODEL` separate from brief model (cheaper/faster model OK for chat)

---

### 4.7 Admin enhancements (light)

#### Functionality
- Sidebar: add **COO** or keep brief inside Analytics (v1: inside Analytics only)
- Orders table: show kitchen progress per order (`1/2 ready`) when item statuses available
- Complete / cancel / modify — unchanged

#### Rationale
- Admin stays the owner/manager surface; employee view is for kitchen only
- Kitchen progress on admin list helps counter staff answer "where's my pizza?"

#### Technical changes
- Extend `GET /api/orders` response to include `items[].status` and `items[].status_code` (optional nested)
- `AdminOrdersTable.jsx` — one extra column or badge on active orders

---

## 5. API reference (new + existing)

### Existing (keep)
| Method | Path |
|--------|------|
| GET | `/api/analytics/sales_daily` |
| GET | `/api/analytics/top_products` |
| GET | `/api/analytics/payment_mix` |
| GET | `/api/analytics/orders_per_hour` |

### New
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/staff` | Staff list for picker |
| GET | `/api/kitchen/queue` | Active order items |
| POST | `/api/kitchen/items/{id}/assign` | Claim item |
| POST | `/api/kitchen/items/{id}/transition` | Advance item status |
| GET | `/api/analytics/summary` | All 4 category KPIs |
| GET | `/api/analytics/product_matrix` | Prep × revenue quadrants |
| GET | `/api/coo/briefing/latest` | Today's AI brief |
| POST | `/api/coo/briefing/generate` | Regenerate brief |
| POST | `/api/coo/chat` | NL question → SQL → answer |
| GET | `/api/coo/chat/threads/{id}/messages` | Chat history (optional) |

---

## 6. Frontend file map (new / changed)

```
src/
  App.jsx                          # add 'employee' view
  lib/
    staffStore.js                  # NEW
    kitchenStore.js                # NEW
    opsConfig.js                   # NEW
    analyticsStore.js              # add getAnalyticsSummary()
    cooStore.js                    # NEW
  components/
    EmployeeBoard.jsx              # NEW
    AdminAnalytics.jsx             # REFACTOR → CooBriefing + 4 stacked categories
    analytics/
      AnalyticsCategoryStack.jsx   # NEW — face card + stack affordance + expand
      AnalyticsDetailCard.jsx      # NEW — detail KPI tile inside expand
    CooBriefing.jsx                # NEW
    CooChat.jsx                    # NEW — NL→SQL chat drawer (§4.6)
    AdminOrdersTable.jsx           # kitchen progress column; link to Employee in top bar
  config (public/)
    ops_config.json                # NEW

backend/
  ai/
    briefing.py                    # NEW
    chat.py                        # NEW — NL→SQL pipeline
    sql_guard.py                   # NEW — allowlist + validation
    prompts/
      coo_brief.md                 # NEW
      coo_chat.md                  # NEW — schema + few-shot SQL
```

---

## 7. Build order (for parallel work)

| Phase | Owner suggestion | Delivers | Blocks |
|-------|------------------|----------|--------|
| **A** | Backend + DB | Schema migration, seed staff, item status on create | Everything |
| **B** | Backend | Kitchen API + roll-up + staff list | Employee UI |
| **C** | Frontend | EmployeeBoard + staffStore + App routing | — |
| **D** | Backend | Analytics summary + item prep MV | Analytics v2 |
| **E** | Frontend | AdminAnalytics refactor (4 categories) | — |
| **F** | Backend + Frontend | AI briefing + CooBriefing card | Needs D for rich KPIs |
| **G** | Backend + Frontend | COO Chat: sql_guard + `/api/coo/chat` + CooChat.jsx + Ask COO FAB | Needs F for brief handoff; D for meaningful SQL answers |

**Rule:** Phases D–F produce empty/wrong data until B is live and items are being transitioned in demo/testing. Chat (G) works with thin data but demo answers are richer after B + D.

**Demo data:** Add a seed script that creates ~20 orders over 7 days with realistic item timestamps for analytics/AI testing.

---

## 8. Vibe-coding prompts (copy-paste starters)

**Phase A — schema**
> Add `order_item_statuses`, extend `order_items` with status + timestamps, create `order_item_status_events`. On order create in `queries.py`, set each item to `queued` and log event. Seed 3 staff rows.

**Phase B — kitchen API**
> Implement `GET /api/kitchen/queue` and `POST /api/kitchen/items/{id}/transition` with valid transition guards, timestamp updates, event logging, and `rollup_order_status()`. Match patterns in existing `queries.py`.

**Phase C — employee UI**
> Add Employee view to App.jsx, build EmployeeBoard.jsx using kitchenStore.js and theme.js. Staff picker from staffStore. Poll queue every 12s. Large buttons: Pick, Start, Ready, Served.

**Phase D — analytics**
> Create `mv_item_prep_stats`, `GET /api/analytics/summary` returning 4 categories. Wire table utilisation from `table_sessions`.

**Phase E — analytics UI**
> Refactor AdminAnalytics: CooBriefing on top, then 4 AnalyticsCategoryStack cards in order: order_times → cancellations → table_utilisation → sales (ops first). Each face shows primary KPI + trend + stack peek. Sales card slightly muted. Accordion expand with Framer Motion. Charts only inside expands (sales charts inside Sales expand).

**Phase F — AI brief**
> Add ai_briefings table, aggregate_kpis(), OpenRouter briefing with 3-section prompt, CooBriefing.jsx at top of analytics. Fallback to JSON bullets if API fails. Ask follow-up button stubbed for Phase G.

**Phase G — COO Chat (NL→SQL)**
> Implement backend/ai/sql_guard.py (SELECT-only allowlist, store_id inject, LIMIT 500), chat.py with OpenRouter two-step (generate SQL → execute read-only → format answer). POST /api/coo/chat. CooChat.jsx drawer + Ask COO FAB + wire Ask follow-up from CooBriefing. Document coo_chat.md prompt in README. Never invent numbers; log sql_executed.

---

## 9. Out of scope (don't build yet)

- Per-quantity sub-tickets (one row per line is enough)
- Supabase Auth for staff (PIN/name picker only)
- Customer-facing chatbot (owner/admin COO chat only — §4.6)
- Inventory / ingredient tracking
- Multi-outlet rollup
- 15+ charts, margin/COGS dashboards (unless `menu_units.cost` is populated later)
- Menu in DB (keep `.txt` files for grading)

---

## 10. Success criteria (demo-ready)

- [ ] Employee can pick an item and advance it through to `served`
- [ ] Every transition logged with `staff_id` + timestamp
- [ ] Admin shows order kitchen progress (e.g. 2/3 ready)
- [ ] Category stacks render in ops-first order (order times → cancellations → table → sales)
- [ ] Stack affordance visible (ghost cards underneath); expand animates detail cards open
- [ ] `prefers-reduced-motion`: no idle stack animation; instant expand OK
- [ ] Avg prep time and slowest pizza reflect real item transitions
- [ ] Prep × revenue matrix shows at least one actionable quadrant with seed data
- [ ] Cancellations expand shows top cancelled items + stage breakdown
- [ ] COO brief renders 3 sections; numbers match analytics API
- [ ] COO Chat answers a demo question with SQL shown (e.g. busiest hour, slowest pizza)
- [ ] Chat rejects unsafe SQL; empty results say “no data” — no hallucinated figures
- [ ] Ask follow-up from brief opens chat with briefing context
- [ ] OpenRouter down → brief fallback bullets; chat shows clear error, no crash
- [ ] `npm test` still green; `npm run build` green

---

## 11. Key domain rules (unchanged)

- Billing: discount at cart qty ≥ 5; GST on post-discount amount (`billing.js` ↔ `queries.py`)
- Tables: occupied while open orders on session; complete/cancel frees table
- Menu: loaded from `public/data/*.txt` — defensive parsing
- Validation: name 2–40 letters/spaces; phone 10 digits starting 6/7/8/9

---

*Questions or scope changes: update this doc first, then prompt against the relevant section.*
