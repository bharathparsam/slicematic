# 🍕 SliceMatic

A React MVP replacing a Delhi pizza shop's Google Form ordering system. Customers
build one or more pizza combos (base + pizza + toppings + quantity), add each to
the order, see an itemised bill with bulk discount and GST, pick a payment method,
and confirm. Staff review all orders in an Admin view.

Orders are persisted via a **Python + PostgreSQL backend** (`backend/`). The React
app talks to it through `src/lib/orderStore.js` (the persistence seam).

It has since grown into a small **restaurant operations system** — order desk,
kitchen board, manager view, and an admin portal with analytics — plus a thin
**AI "COO"** layer (daily brief + natural-language analytics chat).

## Architecture overview

Two tiers with a thin AI layer on top of a normalised Postgres database:

```
Browser — React (5173), four surfaces: Order · Kitchen · Manager · Admin
  │   store seams only (no fetch in components):
  │   orderStore · tableStore · menuStore · analyticsStore · cooStore · kitchenStore · staffStore
  ▼   /api/*  (Vite proxies → :8000 in dev)
FastAPI (8000) — thin routes → queries.py (ALL SQL + Decimal money math) → PostgreSQL 14+
  └── backend/ai/ (LangGraph) → OpenRouter (LLM)     ← decision-support only
PostgreSQL — OLTP tables + reporting materialized views (mv_*)
```

Design principles:

- **Business logic is pure and tested** — `src/lib/` (frontend) and `backend/queries.py`
  (SQL + `Decimal` money). Components render and wire events; they never `fetch`
  directly (they go through the store seams) and never do money math.
- **Menu & tax are data, not code** — loaded at runtime from `public/data/*.txt`
  and `public/config/*.json`. Swap the files and the app follows; nothing is hardcoded.
- **AI is a bonus layer, never a dependency** — if the LLM is unavailable, ordering,
  billing and analytics all keep working, and the daily brief falls back to
  deterministic bullets.
- **Reads go through views** — analytics and the COO chat read flat materialized
  views (`mv_*`) refreshed from the OLTP tables.
- **Durable store is Postgres**; every placed order is *also* appended to a
  flat-text `orders_log.txt` (best-effort; the DB stays the source of truth).

## Quick start

**Frontend only** (requires the API running for save/list to work):

```bash
npm install
npm run dev        # → http://localhost:5173
```

**Full stack** — run both terminals (set up the database first — see below):

```bash
# Terminal 1 — API (see Database setup + Backend setup below)
npm run api

# Terminal 2 — React
npm run dev
```

Other commands:

```bash
npm run build      # production build
npm test           # unit tests (Vitest) over the pure logic in src/lib
npm run api:setup  # create backend venv + install Python deps (first time)
npm run api        # start FastAPI on http://localhost:8000
```

Admin portal is protected by **Supabase Auth** (email + password). Create admin
users in Supabase → Authentication → Users, and set `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` in `.env.local` (see `.env.example`).

## Database setup

The API stores orders in **PostgreSQL 14+**. Schema lives in
[`sql/schema.sql`](./sql/schema.sql) — apply it once before starting the API.

```
React (5173)  →  /api/* proxy  →  FastAPI (8000)  →  PostgreSQL (slicematic)
```

The React app never talks to Postgres directly; only the Python API does, via
`DATABASE_URL` in `backend/.env`.

### Install PostgreSQL

**macOS (Homebrew):**

```bash
brew install postgresql@16
brew services start postgresql@16
```

If `createdb` or `psql` are not found, add Postgres to your PATH (Apple Silicon
example):

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

**Linux (Debian/Ubuntu):**

```bash
sudo apt update && sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:** install from [postgresql.org](https://www.postgresql.org/download/windows/)
and use `psql` from the Start menu shell.

**Supabase / hosted Postgres:** skip local install — create a project, copy the
connection string, and put it in `backend/.env` as `DATABASE_URL` (see step 3).

### 1. Create the database

From the repo root:

```bash
createdb slicematic
psql -d slicematic -f sql/schema.sql
```

This creates all tables, seeds `order_statuses`, and sets up reporting views.
You only need to run this once (re-run only when resetting a dev database).

**Verify the schema loaded:**

```bash
psql -d slicematic -c "\dt"
```

You should see tables such as `orders`, `order_items`, `store_tables`, and
`order_statuses`.

**Test a connection manually:**

```bash
psql -d slicematic -c "SELECT count(*) FROM order_statuses;"
```

### 2. Create a Postgres user (optional)

The example URL uses user `postgres` with password `postgres`. Homebrew Postgres
on macOS often uses your **macOS username** with no password instead:

```bash
whoami   # e.g. rakeshpelluri
psql -d slicematic -c "SELECT current_user;"
```

If you need a dedicated role:

```bash
psql postgres -c "CREATE USER slicematic WITH PASSWORD 'your_password';"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE slicematic TO slicematic;"
```

### 3. Configure `DATABASE_URL`

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` to match your local Postgres credentials:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/slicematic
STORE_NAME=SliceMatic Delhi
```

URL format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`

Common local variants:

```
# Homebrew default — macOS user, no password
DATABASE_URL=postgresql://YOUR_MAC_USER@localhost:5432/slicematic

# Dedicated role
DATABASE_URL=postgresql://slicematic:your_password@localhost:5432/slicematic

# Supabase / remote
DATABASE_URL=postgresql://user:pass@db.xxxx.supabase.co:5432/postgres
```

`backend/.env` is **gitignored** — never commit real passwords. If `.env` is
missing, the API falls back to `postgresql://postgres:postgres@localhost:5432/slicematic`
(see `backend/db.py`).

### Reset the database (dev only)

To wipe and recreate from scratch:

```bash
dropdb slicematic
createdb slicematic
psql -d slicematic -f sql/schema.sql
```

### Database troubleshooting

| Symptom | Likely fix |
|--------|------------|
| `createdb: command not found` | Install Postgres or fix your PATH |
| `connection refused` | Start Postgres (`brew services start postgresql@16` or `sudo systemctl start postgresql`) |
| `database "slicematic" does not exist` | Run `createdb slicematic` |
| `relation "orders" does not exist` | Run `psql -d slicematic -f sql/schema.sql` |
| `password authentication failed` | Fix user/password in `backend/.env` |
| Empty Admin list, 500s in API logs | Schema not applied or wrong database in `DATABASE_URL` |
| `Database unavailable` on order submit | Postgres not running, DB missing, or bad `DATABASE_URL` |

## Backend setup

The API lives in `backend/` — **FastAPI** + **psycopg2**. Complete
[Database setup](#database-setup) first.

### Prerequisites

- **Python 3.11+**
- **PostgreSQL 14+** with `slicematic` created and schema applied (or Supabase)

### 1. Install Python dependencies

One-time setup (creates `backend/.venv`):

```bash
npm run api:setup
```

Or manually:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Start the server

From the repo root:

```bash
npm run api
```

- API base: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

In dev, Vite proxies `/api` → `http://localhost:8000` (see `vite.config.js`), so
the React app can call `/api/orders` without CORS setup.

To point the frontend at a different host:

```bash
VITE_API_URL=http://localhost:8000 npm run dev
```

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/orders` | Create an order (returns UUID `order_id`) |
| `GET` | `/api/orders` | List all orders, newest first |
| `POST` | `/api/complete_order` | Mark an order completed |
| `POST` | `/api/cancel_order` | Cancel an active order |
| `POST` | `/api/rate_order` | Submit a one-time guest rating (1–5) for an active order |
| `PUT` | `/api/orders/{order_id}` | Update an order (modify flow) |
| `GET` | `/api/tables` | List store tables |
| `POST` | `/api/new_table` | Add a table |
| `GET` | `/api/analytics/orders_per_hour` | Hourly order counts (7 days) |
| `GET` | `/api/analytics/top_products` | Best-selling pizzas |
| `GET` | `/api/analytics/sales_daily` | Daily net/gross sales |
| `GET` | `/api/analytics/ratings_daily` | Daily average guest rating (1–5) |
| `GET` | `/api/analytics/payment_mix` | Payment mix (last N days) |
| `GET` | `/api/analytics/summary` | Full ops dashboard payload (4 categories) |
| `GET` | `/api/analytics/sales_range` | Day-wise sales for a custom date range |
| `POST` | `/api/coo/chat` | **Ask COO** — natural language → SQL → answer |
| `GET` | `/api/coo/briefing/latest` | Latest daily COO brief |
| `POST` | `/api/coo/briefing/generate` | Generate today's COO brief |
| `POST` | `/api/menu/set_availability` | Toggle a menu item sold-out |
| `POST` | `/api/block_table`, `/api/remove_table` | Reserve / remove a table |
| `GET` | `/api/kitchen/queue`, `/api/staff` | Kitchen board + staff (ops portal) |

> Above is the customer/analytics/AI subset. The full endpoint list (kitchen,
> staff, tables, menu) is browsable at **http://localhost:8000/docs**.

## The SliceMatic COO — AI features

AI is used in **exactly one place: decision support**. It never touches billing,
discounts, or GST — those stay deterministic rules (`billing.js` ↔ `queries.py`).
Two features, both via [OpenRouter](https://openrouter.ai):

### 1. Daily COO Brief
A once-a-day executive summary at the top of **Admin → Analytics**, in three
sections — *What went well · What didn't go well · What to do* — written from a
KPI snapshot (sales, prep times, cancellations, table dwell, discounts, guest
ratings). Ops problems lead; sales is supporting evidence. Stored per business day
in the `ai_briefings` table.

- Endpoints: `GET /api/coo/briefing/latest`, `POST /api/coo/briefing/generate`
- **Fallback:** if the LLM is down, a deterministic bullet summary is generated
  from the same KPI JSON — no prose, still useful.

### 2. Ask COO — natural language → SQL
The owner asks in plain English ("which pizza is slowest?", "how much did
discounts cost this week?"). A **LangGraph** pipeline answers:

1. LLM converts the question into a single read-only `SELECT`.
2. `backend/ai/sql_guard.py` validates it — **SELECT-only**, allowlisted tables,
   `store_id` injected, `LIMIT` enforced; any write/DDL/secret column is rejected.
   On a DB error it feeds the message back to the model to self-correct (retry).
3. The query runs on a **read-only** connection.
4. A second LLM call phrases the rows in plain language (₹, Asia/Kolkata).

- Endpoints: `POST /api/coo/chat`, `GET /api/coo/chat/threads/{id}/messages`
- The AI **never invents numbers** — every figure is a real SQL result; empty
  results answer "no data for that period".

### Model chosen — and why
Both features default to **`google/gemini-2.5-flash`** via OpenRouter:

- **Fast + inexpensive** — the brief and each chat turn are short, latency-sensitive
  owner interactions; Flash keeps them snappy and cheap per call.
- **Reliable structured output** — strong at emitting a single clean `SELECT` from
  the schema embedded in the prompt, which is exactly what the NL→SQL step needs.
- **Provider-agnostic** — OpenRouter swaps models with one env var, no code change:
  `OPENROUTER_MODEL` (global) or `COO_BRIEF_MODEL` / `COO_CHAT_MODEL` (per feature),
  so chat can run a cheaper model while the brief uses a stronger one.

Configure in `backend/.env` (see `backend/.env.example`):

```
OPENROUTER_API_KEY=sk-or-v1-...            # get one at openrouter.ai/keys
OPENROUTER_MODEL=google/gemini-2.5-flash   # optional — this is the default
# COO_BRIEF_MODEL / COO_CHAT_MODEL         # optional per-feature overrides
```

The key is **server-side only** — never a Vite/`VITE_` variable. Restart
`npm run api` after editing `.env`. If the key is missing, the chat returns a
clear "set OPENROUTER_API_KEY" message and the brief uses its deterministic
fallback — the rest of the app is unaffected.

### System prompts used
Version-controlled in `backend/ai/prompts/`:

- **`coo_chat.md`** — NL→SQL generator (schema + rules + few-shot examples)
- **`coo_answer.md`** — plain-English answer formatter (numbers only from results)
- **`coo_brief.md`** — daily brief generator (3 sections, ops-first)

<details>
<summary><b>coo_chat.md</b> — the NL → SQL system prompt</summary>

````
You are SliceMatic's AI COO — a read-only SQL analyst for a pizza restaurant in Delhi.

Your job: convert owner questions into a single PostgreSQL SELECT, then explain results in plain language.

## Schema (allowlisted tables only)

**Materialized views (prefer these):**
- mv_daily_sales(store_id, business_date, channel, orders_count, gross_sales, discounts, tax_collected, net_sales, avg_ticket)
- mv_product_sales(store_id, menu_unit_id, item_name, role, units_sold, component_revenue)
- mv_payment_mix(store_id, business_date, method, payments_count, amount)
- mv_table_turnover(store_id, table_id, business_date, sessions, avg_dwell_minutes, covers)
- mv_order_item_facts(store_id, business_date, channel, order_hour, order_item_id, builds, line_total, order_id)
- mv_item_prep_stats(store_id, menu_unit_id, pizza_name, items_completed, avg_prep_minutes, p90_prep_minutes)
- mv_cancellation_items(store_id, pizza_name, cancelled_orders, cancelled_units)
- mv_cancellation_stages(store_id, cancelled_from_stage, cancel_count)

**Drill-down tables:**
- orders, order_items, order_item_selections, order_item_status_events
- order_feedback (guest rating 1–5 per order; join orders for store_id and business_date)
- table_sessions, store_tables, order_status_events, order_statuses, order_item_statuses

## Rules
- Output ONLY one SELECT query inside ```sql fences when generating SQL.
- Always filter store_id = 1 (injected if missing).
- Revenue queries: join order_statuses WHERE is_settled = true unless asking about cancellations.
- Use Asia/Kolkata for date/time. Format money as ₹.
- Ops-first: prefer prep, cancel, table queries over pure sales when ambiguous.
- Guest ratings live in order_feedback (1–5, one row per order); always join orders for store_id.
- Never SELECT auth_user_id, payments.reference, or run writes/DDL.

## Few-shot examples
(6 worked Q → SQL examples: busiest hour, slowest pizza, cancel rate by stage,
 longest table dwell, average guest rating, daily average rating.)

When answering (not generating SQL): use ONLY numbers from query results. If empty, say "No data for that period."
````
</details>

<details>
<summary><b>coo_brief.md</b> — the daily-brief system prompt</summary>

```
You are SliceMatic's AI COO for a single-outlet pizza restaurant in Delhi, India.

Generate a daily operations brief in exactly three sections:

## What went well
Lead with operational wins: prep on target, low cancellations, good table turns. Mention sales only if it validates an ops fix.

## What didn't go well
Prep delays, cancel stages/items, dwell spikes first. Revenue impact second ("cost ~₹X").

## What to do
2–3 concrete actions from order times, cancellations, table utilisation, and item mix. Optional "expect sales lift if…" tie-in.

Rules:
- NEVER invent numbers — only narrate fields from the KPI JSON provided.
- Every action must cite a specific KPI field from the snapshot.
- Ops problems before sales. Sales is supporting evidence, not the headline.
- Include guest_ratings from the KPI JSON when present (avg 1–5, response rate, daily trend).
- Use ₹ for currency, Asia/Kolkata timezone, plain language for a busy owner.
- Keep the full brief under 250 words.
```
</details>

<details>
<summary><b>coo_answer.md</b> — the answer-formatter prompt</summary>

```
You are SliceMatic's AI COO speaking to the restaurant owner in plain English.

You receive a question and JSON query results. Write a clear, conversational answer in 2–4 sentences.

Rules:
- Use ONLY numbers and names from the results — never invent data.
- Do NOT output SQL, JSON, markdown tables, or raw column names (like item_name, units_sold).
- Format money as ₹ with Indian grouping when relevant.
- If results are empty, say there is no data for that period and suggest narrowing the question.
- Lead with the direct answer to the question, then one brief insight if useful.
```
</details>

### Troubleshooting

- **API won't start** — run `npm run api:setup` first, then `npm run api`.
- **Empty Admin list but orders exist** — check the API terminal for 500 errors;
  see [Database troubleshooting](#database-troubleshooting).
- **`Database unavailable` on submit** — Postgres is not running, the database
  does not exist, or `DATABASE_URL` in `backend/.env` is wrong.
- **Chat says "set OPENROUTER_API_KEY"** — add your OpenRouter key to
  `backend/.env` and restart the API.

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
- **GST** = rate × the **post-discount** amount (`subtotal − discount`), shown split into CGST + SGST
- **Total** = subtotal − discount + GST

GST + discount rates are **not hardcoded** — they load at runtime from
`public/config/tax_config.json` (same swappable pattern as the menu). SliceMatic
is a standalone restaurant/takeaway, so the default is **5% GST (2.5% CGST +
2.5% SGST), no input tax credit**
([basis](https://cleartax.in/s/impact-gst-food-services-restaurant-business)). To
model a hotel restaurant or delivery aggregator (18%), edit that file — no code
change, no rebuild.

## Project structure

```
backend/                 FastAPI routes (thin) + queries.py (all SQL + billing)
backend/ai/              LangGraph COO: chat_graph, sql_guard, briefing, prompts/
backend/order_log.py     Flat-text orders_log.txt writer (append + backfill)
sql/schema.sql           PostgreSQL schema (apply before first run)
public/data/*.txt        Menu source files (swappable)
public/config/*.json     Tax + ops config (swappable)
src/lib/                 Pure, tested business logic + store seams (orderStore, cooStore, …)
src/components/          UI: order desk, kitchen, manager, admin (analytics/menu/tables/staff)
src/App.jsx              Flow orchestration + Order/Kitchen/Manager/Admin view toggle
```

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, domain rules, and
conventions — read it before contributing (and it primes Claude Code for this repo).

## Tech

Vite · React · Tailwind CSS · shadcn/ui idiom · Framer Motion · Vitest · FastAPI ·
PostgreSQL · LangGraph · OpenRouter (`google/gemini-2.5-flash`).
