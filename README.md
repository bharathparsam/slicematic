# 🍕 SliceMatic

A React MVP replacing a Delhi pizza shop's Google Form ordering system. Customers
build one or more pizza combos (base + pizza + toppings + quantity), add each to
the order, see an itemised bill with bulk discount and GST, pick a payment method,
and confirm. Staff review all orders in an Admin view.

Orders are persisted via a **Python + PostgreSQL backend** (`backend/`). The React
app talks to it through `src/lib/orderStore.js` (the persistence seam).

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
| `PUT` | `/api/orders/{order_id}` | Update an order (modify flow) |
| `GET` | `/api/tables` | List store tables |
| `POST` | `/api/new_table` | Add a table |
| `GET` | `/api/analytics/orders_per_hour` | Hourly order counts (7 days) |
| `GET` | `/api/analytics/top_products` | Best-selling pizzas |
| `GET` | `/api/analytics/sales_daily` | Daily net/gross sales |
| `GET` | `/api/analytics/payment_mix` | Payment mix (last N days) |
| `POST` | `/api/analytics/chat` | COO chatbot — natural-language analytics Q&A |

### COO chatbot (OpenRouter)

Admin → **Ask COO** sends questions to `POST /api/analytics/chat`. The backend
loads live analytics from Postgres, embeds them in a prompt, and calls
[OpenRouter](https://openrouter.ai) (default model: `google/gemini-2.5-flash`).

Add to `backend/.env` (see `backend/.env.example`):

```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=google/gemini-2.5-flash
```

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys). The key stays
**server-side only** — never put it in Vite env vars. Restart `npm run api`
after changing `.env`.

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
backend/                 Python FastAPI server + Postgres queries
sql/schema.sql           PostgreSQL schema (apply before first run)
public/data/*.txt        Menu source files (swappable)
src/lib/                 Pure, tested business logic + orderStore API seam
src/components/          UI: intake, menu, summary, payment, admin + shadcn-style primitives
src/App.jsx              Flow orchestration + Order/Admin tab toggle
```

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, domain rules, and
conventions — read it before contributing (and it primes Claude Code for this repo).

## Tech

Vite · React · Tailwind CSS · shadcn/ui idiom · Vitest · FastAPI · PostgreSQL.
