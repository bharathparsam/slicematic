# SliceMatic — Database Schema Design

*Why the schema (`sql/schema.sql`) is designed the way it is — two ways to explain it: the intuitive version, then the detailed table-by-table version. Use whichever the audience needs.*

---

## The problem it solves

The old system was a **Google Sheet: one flat row per order** — timestamp, base, pizza, toppings. Easy to write, but it can't answer a single business question. *"Which topping earns the most?" "Which pizza is slow?" "How much did discounts cost me?"* — none of it is answerable from flat rows.

So the schema's whole job is: **turn flat records into something you can ask questions of.** Everything else follows from that.

## The one mental model

> **Record transactions cleanly in many small related tables → build a thin "reporting" layer on top for analytics → and freeze money/history so the past never changes.**

---

# Part 1 — The intuition (what breaks if we skip it)

### Why split into many tables instead of one big one?
An order isn't one thing — it's a customer, a table, *several* pizzas, each with *several* toppings, one payment, and a status that changes over time. Cram all that into one row (like the sheet) and you literally **cannot** ask "which topping is popular" — toppings would be text mashed into a cell.
- `orders` → `order_items` (one per pizza) → `order_item_selections` (one per base/pizza/topping).
- **That item-and-topping grain is what lets the AI COO answer "which pizza is slowest" or "top topping."** The relationships *are* the analytics.

### Why snapshot the money onto the order?
Print a bill today, raise the Margherita price next week — if the bill just *pointed* at the menu, the old bill would silently change. An accounting nightmare.
- Each order **copies** its own prices, discount, and GST at sale time. History is frozen. (We still keep a link back to the catalog for drill-through — best of both.)

### Why `store_id` on every table?
One outlet today; maybe two tomorrow. You don't want to rebuild the database for branch #2.
- Every table carries `store_id`, so a new outlet is **just more rows**, not a migration. "Built to grow."

### Why is status a lookup table *plus* an event log?
- The **app** needs "is this table busy?" and analytics need "is this revenue?" — both read the same flags (`is_open`, `is_settled`), so there's one source of truth, no duplicated logic.
- The **event log** (every status change, with who/when) measures "how long from order to ready" and gives an audit trail. A single status column can't tell you *history*.

### Why a separate reporting layer (the `mv_` views)?
If every chart ran big joins on the live tables, the ordering app would slow down under load.
- We pre-compute flat summaries (daily sales, prep times, cancellations) into **materialized views**. The live app stays fast; dashboards and the AI read pre-chewed numbers.

### The honest part
The database is **richer than the MVP strictly needs** — multi-outlet, staff, promotions, feedback, eight views. Deliberate: new features (kitchen ops, AI COO, loyalty) become *adding data*, not *migrating schemas*. Cost: a few tables sit lightly used early on — a fair trade for not repainting the foundation every time you add a room.

---

# Part 2 — The detailed design

## 5 principles that apply to *every* table
1. **`store_id` on everything → multi-outlet is a data change, not a migration.**
2. **Snapshot + keep the FK.** `orders`, `order_items`, `order_item_selections` copy name & price at sale time *and* keep a hard foreign key to the catalog. History frozen; drill-through still works.
3. **Money is `numeric(12,2)`, never float.** Exact decimal, no drift — dashboards `SUM()` directly.
4. **`timestamptz` everywhere + a `business_date`.** Correct across timezones; a late shift past midnight still books to the right trading day (`stores.day_cutoff`). Hence the daily `SM-0001` code resets per business day.
5. **Status = a lookup + an append-only event log.** Current status in a small lookup with behavior flags; every change logged with who/when/why. One source of truth for the app *and* analytics.

## Table-by-table (grouped)

**Who & where — dimensions**
- `stores`, `staff`, `users`, `store_tables`, `table_sessions`, `menu_categories`, `menu_units`, `tax_profiles`, `promotions`.
- **Customers (`users`) and staff (`staff`) are separate** — different entities/jobs; not one table with a "type" flag. Customers key on phone (loyalty/repeat); staff carry a role + PIN.
- `store_tables.current_session_id` is the anti-double-booking pointer ("table in use"); `table_sessions` (seated/closed) gives dwell time and turnover.
- **Why `menu_units` exists even though the menu is in `.txt` files:** the *live* menu is deliberately **data-not-code** (loaded from swappable `.txt` files, for grading). `menu_units` is the *order-derived* catalog (created on first order) so each selection has a real FK for product analytics.

**The transaction core**
- `orders` — ticket header: daily ticketing (`business_date` + `order_sequence` + `order_code`), a customer snapshot, the **fully snapshotted financials** (subtotal, discount, CGST/SGST, grand total, the GST *rate* that applied), plus lifecycle timestamps.
- `order_items` — one *built pizza × quantity*, with its own kitchen status + timestamps.
- `order_item_selections` — one row per base / pizza / topping. This fine grain answers "which pizza / which topping."
- `payments` — modeled for split tender, refunds, and a reference (UPI/card id), even though the app uses one payment today.

**Status as data + audit logs**
- `order_statuses` / `order_item_statuses` — lookups with flags: `is_open` = "occupies a table," `is_settled` = "counts as revenue," `is_cancelled`. App *and* analytics derive from those flags.
- `order_status_events` / `order_item_status_events` — append-only logs → prep-time KPIs (placed→ready), cancellation-stage breakdown, full audit.

**Small targeted overlays**
- `menu_availability` — a sold-out flag keyed by the `.txt` **line id** (`P1`/`B1`/`T1`), so it survives a menu swap.
- `order_feedback` — one guest rating (1–5) per order.

**AI persistence**
- `ai_briefings` (one brief per business day); `ai_chat_threads` / `ai_chat_messages` — the messages log stores the **SQL that was executed** alongside each answer (audit + the demo's "show SQL" toggle).

**Reporting layer — materialized views**
- `mv_daily_sales`, `mv_product_sales`, `mv_payment_mix`, `mv_table_turnover`, `mv_order_item_facts`, `mv_item_prep_stats`, `mv_cancellation_items` / `mv_cancellation_stages`, refreshed by `refresh_reporting()`.
- Analytics and the AI COO query flat, pre-joined, already-settled-filtered data instead of heavy joins on every request.

## The "why" details an evaluator will poke at
- **Daily order code:** `unique(store_id, business_date, order_code)` — `SM-0001` resets each day. A global unique would collide on day 2 (we hit that and fixed it).
- **GST is snapshotted on the order**, not re-derived — so changing `tax_config` later never rewrites old bills.
- **RLS enabled with no policies** on the tables: on Supabase this *seals the auto-exposed PostgREST API* (blocks `anon`/`authenticated`), while the backend connects as the table owner and bypasses RLS — app unaffected, public API door shut.

---

## Quick explainers

**30-second version:**
> *"Normalized transactions, a reporting layer on top, and everything money-related is snapshotted so bills never change retroactively. `store_id` everywhere makes it multi-outlet-ready, status lives in lookups with flags plus append-only event logs so the app and analytics share one source of truth, and the item/selection grain is what lets the AI COO answer 'which pizza is slow' or 'what's my best topping.'"*

**20-second version:**
> *"A Google Sheet records flat rows you can't query. We split orders into orders → items → toppings so the data itself answers business questions, snapshot every bill so history never changes, tag everything with a store id so it scales to more outlets, and put a reporting layer on top so analytics don't slow the app. It's designed to be **interpreted**, not just stored."*
