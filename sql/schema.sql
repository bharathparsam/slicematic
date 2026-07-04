-- ============================================================================
-- SliceMatic — PostgreSQL schema (Supabase-ready)
-- ============================================================================
-- Target      : PostgreSQL 14+ / Supabase
-- Conventions :
--   * Money    : numeric(12,2), currency INR. Postgres numeric is EXACT
--                (no float drift) — dashboards can SUM directly.
--   * Time     : timestamptz everywhere; business_date is Asia/Kolkata date
--                with a configurable day-cutoff so a late shift past midnight
--                still books to the correct trading day.
--   * History  : order lines SNAPSHOT name + unit_price at sale time, while
--                keeping a hard FK back to menu_units for drill-through.
--   * Status   : lifecycle lives in the `order_statuses` lookup + an append-only
--                `order_status_events` log (who/when/why) for kitchen + ops KPIs.
--   * Analytics: a thin reporting layer (materialized views) sits on top of the
--                normalized OLTP tables — keep transactions clean, query flat.
--
-- App mapping : the current MVP's fields map cleanly here —
--   orderCode -> orders.order_code, table -> table_sessions/store_tables,
--   name/phone -> users (+ snapshots on orders), items[] -> order_items +
--   order_item_selections, paymentMode -> payments.method, gst/cgst/sgst/rate ->
--   orders.* tax columns, status active/completed/cancelled -> order_statuses.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums (small, fixed vocabularies)
-- ---------------------------------------------------------------------------
create type order_channel  as enum ('dine_in', 'takeaway', 'delivery');
create type payment_method as enum ('cash', 'card', 'upi', 'wallet', 'other');
create type payment_status as enum ('captured', 'pending', 'refunded', 'voided');
create type menu_item_type as enum ('base', 'pizza', 'topping', 'beverage', 'side', 'dessert', 'combo');
create type session_status as enum ('open', 'closed', 'abandoned');

-- Keep every row's updated_at fresh.
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ===========================================================================
-- DIMENSIONS / CATALOG
-- ===========================================================================

-- Multi-outlet ready (single row today). Every transactional table carries
-- store_id so a second SliceMatic branch is a data change, not a migration.
create table stores (
  id            bigint generated always as identity primary key,
  name          text not null,
  timezone      text not null default 'Asia/Kolkata',
  day_cutoff    time not null default '00:00',   -- e.g. '04:00' = trading day rolls at 4am
  gstin         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Staff / operators (the admin who Completes / Cancels / Modifies). Distinct
-- from customers. actor_id on orders + status events points here.
create table staff (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references stores(id),
  auth_user_id  uuid,                              -- link to Supabase auth.users
  full_name     text not null,
  role          text not null default 'staff',     -- staff | manager | admin
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Customers. phone is the natural lookup key. Loyalty/repeat-visit analytics.
create table users (
  id            bigint generated always as identity primary key,
  phone         text not null,
  full_name     text,
  email         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (phone)
);

-- Physical seating. current_session_id is the anti-double-booking pointer that
-- powers the app's "table in use" block (null = free).
create table store_tables (
  id                  bigint generated always as identity primary key,
  store_id            bigint not null references stores(id),
  label               text not null,               -- "Table 3"
  seats               smallint,
  current_session_id  bigint,                       -- FK added after table_sessions
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, label)
);

-- A dining event: one seated group, possibly several orders (rounds). Unlocks
-- dwell-time, table-turnover and per-cover spend.
create table table_sessions (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references stores(id),
  table_id      bigint not null references store_tables(id),
  user_id       bigint references users(id),        -- primary guest, if known
  party_size    smallint check (party_size > 0),
  status        session_status not null default 'open',
  seated_at     timestamptz not null default now(),
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (closed_at is null or closed_at >= seated_at)
);
alter table store_tables
  add constraint store_tables_current_session_fk
  foreign key (current_session_id) references table_sessions(id) on delete set null;

-- Menu category dimension: "Pizzas", "Toppings", "Beverages" — the slice-by for
-- category mix / attach-rate dashboards.
create table menu_categories (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references stores(id),
  name          text not null,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  unique (store_id, name)
);

-- Central catalog of everything sellable (bases, pizzas, toppings, drinks...).
-- Soft-delete via is_active preserves historical FK links. cost enables MARGIN,
-- not just revenue. is_veg + tags enable dietary-mix analytics.
create table menu_units (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references stores(id),
  category_id   bigint references menu_categories(id),
  item_type     menu_item_type not null,
  sku           text,
  name          text not null,
  price         numeric(12,2) not null check (price >= 0),
  cost          numeric(12,2) check (cost >= 0),     -- COGS for margin analytics
  is_veg        boolean,
  tags          text[] not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (store_id, sku)
);

-- Which modifiers may attach to which parent (e.g. allowed toppings for a pizza,
-- allowed bases). Adjacency list with optional pricing override + min/max rules.
create table menu_unit_availability (
  id                bigint generated always as identity primary key,
  parent_unit_id    bigint not null references menu_units(id),
  modifier_unit_id  bigint not null references menu_units(id),
  price_override    numeric(12,2) check (price_override >= 0),
  min_qty           smallint not null default 0,
  max_qty           smallint,
  is_default        boolean not null default false,
  unique (parent_unit_id, modifier_unit_id),
  check (parent_unit_id <> modifier_unit_id)
);

-- Config-driven GST (the app already toggles 5% dine-in vs 18% delivery). Orders
-- SNAPSHOT the rate that applied so historical tax reports never drift.
create table tax_profiles (
  id                bigint generated always as identity primary key,
  store_id          bigint not null references stores(id),
  name              text not null,                  -- "Standalone restaurant 5%"
  channel           order_channel,                  -- null = applies to any
  gst_rate          numeric(5,4) not null,          -- 0.0500
  cgst_rate         numeric(5,4) not null,
  sgst_rate         numeric(5,4) not null,
  input_tax_credit  boolean not null default false,
  effective_from    date not null default current_date,
  is_active         boolean not null default true
);

-- Optional promo/discount modeling (today it's a simple qty>=5 rule; this makes
-- it first-class for promo-effectiveness dashboards later).
create table promotions (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references stores(id),
  code          text,
  name          text not null,
  kind          text not null,                      -- percent | flat | bulk_qty
  value         numeric(12,2) not null,
  min_qty       smallint,
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_active     boolean not null default true,
  unique (store_id, code)
);

-- Order lifecycle lookup. Flags drive both the app (is_open == "occupies table")
-- and analytics (is_settled == revenue-recognized).
create table order_statuses (
  id            smallint generated always as identity primary key,
  code          text not null unique,               -- draft|placed|preparing|ready|served|completed|cancelled
  name          text not null,
  sort_order    smallint not null,
  is_open       boolean not null default false,      -- occupies the table / "active"
  is_settled    boolean not null default false,      -- counts toward sales
  is_cancelled  boolean not null default false
);

-- ===========================================================================
-- TRANSACTIONS
-- ===========================================================================

-- Order header. One row per ticket. Carries the full financial breakdown,
-- snapshotted so it can never drift from menu/tax/config changes.
create table orders (
  id                  bigint generated always as identity primary key,
  public_id           uuid not null default gen_random_uuid(),
  store_id            bigint not null references stores(id),
  session_id          bigint references table_sessions(id),   -- null for takeaway/delivery
  user_id             bigint references users(id),
  created_by_staff_id bigint references staff(id),            -- null = customer QR self-order
  channel             order_channel not null default 'dine_in',
  status_id           smallint not null references order_statuses(id),

  -- Ticketing (daily, per store — a shift rolls at stores.day_cutoff).
  business_date       date not null,
  order_sequence      int not null,
  order_code          text not null,                          -- "SM-0001"

  -- Customer snapshot (app captures name/phone even without a users row).
  customer_name       text,
  customer_phone      text,

  -- Financials (all snapshotted; the app already computes each of these).
  currency            char(3) not null default 'INR',
  subtotal            numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_amount     numeric(12,2) not null default 0 check (discount_amount >= 0),
  discount_reason     text,
  promotion_id        bigint references promotions(id),
  taxable_amount      numeric(12,2) not null default 0,       -- subtotal - discount
  tax_profile_id      bigint references tax_profiles(id),
  gst_rate            numeric(5,4) not null default 0,        -- rate that applied
  cgst_amount         numeric(12,2) not null default 0,
  sgst_amount         numeric(12,2) not null default 0,
  tax_amount          numeric(12,2) not null default 0,
  service_charge      numeric(12,2) not null default 0,
  rounding_adjustment numeric(12,2) not null default 0,
  grand_total         numeric(12,2) not null default 0 check (grand_total >= 0),

  -- Lifecycle timestamps (redundant-but-fast for time-to-X analytics).
  created_at          timestamptz not null default now(),
  placed_at           timestamptz,
  ready_at            timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,
  notes               text,
  updated_at          timestamptz not null default now(),

  unique (store_id, order_code),
  unique (store_id, business_date, order_sequence)
);

-- A single cart line = one built pizza (base + toppings) at a quantity.
create table order_items (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references orders(id) on delete cascade,
  line_no       smallint not null,
  quantity      smallint not null check (quantity between 1 and 99),
  unit_price    numeric(12,2) not null check (unit_price >= 0),  -- combined build price
  line_subtotal numeric(12,2) not null check (line_subtotal >= 0),
  line_discount numeric(12,2) not null default 0 check (line_discount >= 0),
  line_tax      numeric(12,2) not null default 0,
  line_total    numeric(12,2) not null check (line_total >= 0),
  notes         text,
  unique (order_id, line_no)
);

-- The component breakdown of a build: the base, the pizza, each topping — one
-- row each. Snapshots name + unit_price; keeps a hard FK to menu_units.
-- This is the grain that powers "highest sold product" and topping attach-rate.
create table order_item_selections (
  id            bigint generated always as identity primary key,
  order_item_id bigint not null references order_items(id) on delete cascade,
  menu_unit_id  bigint not null references menu_units(id),
  role          menu_item_type not null,             -- base | pizza | topping | ...
  item_name     text not null,                       -- snapshot
  unit_price    numeric(12,2) not null check (unit_price >= 0), -- snapshot
  quantity      smallint not null default 1 check (quantity > 0)
);

-- Money in. Supports SPLIT tender (many rows/order), refunds and change.
create table payments (
  id              bigint generated always as identity primary key,
  order_id        bigint not null references orders(id) on delete cascade,
  method          payment_method not null,
  status          payment_status not null default 'captured',
  amount          numeric(12,2) not null,             -- negative = refund
  tendered_amount numeric(12,2),
  change_amount   numeric(12,2) not null default 0,
  reference       text,                               -- UPI txn id / card ref
  received_by     bigint references staff(id),
  paid_at         timestamptz not null default now()
);

-- Append-only state log: who moved the order to which status, when, and why.
-- Drives kitchen efficiency (placed->ready), drop-off, and cancellation reasons.
create table order_status_events (
  id              bigint generated always as identity primary key,
  order_id        bigint not null references orders(id) on delete cascade,
  from_status_id  smallint references order_statuses(id),
  to_status_id    smallint not null references order_statuses(id),
  actor_staff_id  bigint references staff(id),
  reason          text,
  occurred_at     timestamptz not null default now()
);

-- Guest satisfaction (feeds the future AI "COO insights").
create table order_feedback (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references orders(id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now(),
  unique (order_id)
);

-- ===========================================================================
-- MENU AVAILABILITY  (sold-out toggles for the admin Menu tab)
-- ===========================================================================
-- The live menu is served from the public/data/*.txt files, keyed by a stable
-- id per line (e.g. 'P1'). This table records ONLY the mutable availability
-- overlay for those ids — a row exists once an item has been toggled. Absence
-- of a row means "available". Decoupled from menu_units (which is order-derived)
-- so it works for items that have never been ordered.
--
-- >>> INCREMENTAL MIGRATION: to add this to an already-deployed database, run
-- >>> JUST this one CREATE TABLE (+ its trigger below) in the Supabase SQL
-- >>> editor. It is purely additive — no existing table/row is touched.
create table menu_availability (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references stores(id),
  item_type     menu_item_type not null,           -- 'pizza' today
  item_id       text not null,                      -- stable menu-file id, e.g. 'P1'
  item_name     text,                               -- snapshot for admin display
  is_sold_out   boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (store_id, item_type, item_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger t_stores_updated     before update on stores         for each row execute function set_updated_at();
create trigger t_staff_updated      before update on staff          for each row execute function set_updated_at();
create trigger t_users_updated      before update on users          for each row execute function set_updated_at();
create trigger t_tables_updated     before update on store_tables   for each row execute function set_updated_at();
create trigger t_sessions_updated   before update on table_sessions for each row execute function set_updated_at();
create trigger t_units_updated      before update on menu_units     for each row execute function set_updated_at();
create trigger t_orders_updated     before update on orders         for each row execute function set_updated_at();
create trigger t_menu_avail_updated before update on menu_availability for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes tuned for the dashboards
-- ---------------------------------------------------------------------------
create index idx_orders_store_bizdate   on orders (store_id, business_date);
create index idx_orders_status          on orders (status_id);
create index idx_orders_channel         on orders (channel);
create index idx_orders_created_at      on orders (created_at);
create index idx_orders_session         on orders (session_id);
create index idx_order_items_order      on order_items (order_id);
create index idx_selections_item        on order_item_selections (order_item_id);
create index idx_selections_unit        on order_item_selections (menu_unit_id);
create index idx_payments_order         on payments (order_id);
create index idx_payments_method        on payments (method, paid_at);
create index idx_status_events_order    on order_status_events (order_id, occurred_at);
create index idx_sessions_table         on table_sessions (table_id, status);

-- ===========================================================================
-- SEED — lookups (safe to run once)
-- ===========================================================================
insert into order_statuses (code, name, sort_order, is_open, is_settled, is_cancelled) values
  ('draft',     'Draft',     10, false, false, false),
  ('placed',    'Placed',    20, true,  false, false),
  ('preparing', 'Preparing', 30, true,  false, false),
  ('ready',     'Ready',     40, true,  false, false),
  ('served',    'Served',    50, true,  false, false),
  ('completed', 'Completed', 60, false, true,  false),
  ('cancelled', 'Cancelled', 70, false, false, true);
-- App mapping: current MVP 'active' -> placed/preparing/ready/served (is_open),
--              'completed' -> completed (is_settled), 'cancelled' -> cancelled.

-- ===========================================================================
-- REPORTING LAYER — flat, dashboard-friendly (refresh on a schedule / trigger)
-- ===========================================================================

-- Order-line fact at the "build" grain, already joined + settled-filtered.
create materialized view mv_order_item_facts as
select
  o.store_id,
  o.business_date,
  o.channel,
  date_trunc('hour', o.created_at) as order_hour,
  oi.id            as order_item_id,
  oi.quantity      as builds,
  oi.line_total,
  o.id             as order_id
from orders o
join order_items oi on oi.order_id = o.id
join order_statuses s on s.id = o.status_id
where s.is_settled;

create index on mv_order_item_facts (store_id, business_date);

-- Daily sales — "last three days" is just a WHERE on this.
create materialized view mv_daily_sales as
select
  o.store_id,
  o.business_date,
  o.channel,
  count(*)                          as orders_count,
  sum(o.subtotal)                   as gross_sales,
  sum(o.discount_amount)            as discounts,
  sum(o.tax_amount)                 as tax_collected,
  sum(o.grand_total)                as net_sales,
  round(avg(o.grand_total), 2)      as avg_ticket
from orders o
join order_statuses s on s.id = o.status_id
where s.is_settled
group by o.store_id, o.business_date, o.channel;

create index on mv_daily_sales (store_id, business_date);

-- Product performance — "highest sold product" (filter role='pizza' for pizzas,
-- 'topping' for top toppings, etc.). units_sold accounts for build quantity.
create materialized view mv_product_sales as
select
  o.store_id,
  sel.menu_unit_id,
  sel.item_name,
  sel.role,
  sum(sel.quantity * oi.quantity)                    as units_sold,
  sum(sel.unit_price * sel.quantity * oi.quantity)   as component_revenue
from order_item_selections sel
join order_items oi on oi.id = sel.order_item_id
join orders o       on o.id = oi.order_id
join order_statuses s on s.id = o.status_id
where s.is_settled
group by o.store_id, sel.menu_unit_id, sel.item_name, sel.role;

create index on mv_product_sales (store_id, role, units_sold desc);

-- Tender mix — revenue by Cash/Card/UPI.
create materialized view mv_payment_mix as
select
  o.store_id,
  o.business_date,
  p.method,
  count(*)        as payments_count,
  sum(p.amount)   as amount
from payments p
join orders o on o.id = p.order_id
where p.status = 'captured'
group by o.store_id, o.business_date, p.method;

-- Table turnover / dwell — hospitality KPIs.
create materialized view mv_table_turnover as
select
  ts.store_id,
  ts.table_id,
  (ts.seated_at at time zone 'Asia/Kolkata')::date          as business_date,
  count(*)                                                   as sessions,
  round(avg(extract(epoch from (ts.closed_at - ts.seated_at)) / 60.0), 1) as avg_dwell_minutes,
  sum(ts.party_size)                                         as covers
from table_sessions ts
where ts.status = 'closed' and ts.closed_at is not null
group by ts.store_id, ts.table_id, (ts.seated_at at time zone 'Asia/Kolkata')::date;

-- One call to refresh them all (schedule via pg_cron / Supabase cron).
create or replace function refresh_reporting() returns void as $$
begin
  refresh materialized view mv_order_item_facts;
  refresh materialized view mv_daily_sales;
  refresh materialized view mv_product_sales;
  refresh materialized view mv_payment_mix;
  refresh materialized view mv_table_turnover;
end;
$$ language plpgsql;

-- ===========================================================================
-- EXAMPLE ANALYTICS QUERIES
-- ===========================================================================
-- Highest sold pizzas (all time):
--   select item_name, units_sold, component_revenue
--   from mv_product_sales where role = 'pizza'
--   order by units_sold desc limit 10;
--
-- Last three days of sales (net, per day):
--   select business_date, sum(net_sales) as net_sales, sum(orders_count) as orders
--   from mv_daily_sales
--   where business_date >= current_date - interval '2 days'
--   group by business_date order by business_date;
--
-- Today's revenue by tender:
--   select method, amount from mv_payment_mix
--   where business_date = current_date;
--
-- Peak hours (this week):
--   select order_hour, sum(builds) as pizzas, sum(line_total) as sales
--   from mv_order_item_facts
--   where business_date >= current_date - interval '7 days'
--   group by order_hour order by order_hour;

-- ===========================================================================
-- SECURITY (Supabase) — outline
-- ===========================================================================
-- Enable RLS on customer-writable tables (orders, order_items, ...), and grant
-- full read/write to authenticated staff via a policy keyed on staff.auth_user_id.
-- Dashboards read the mv_* views through a role that only has SELECT on them.
-- (Policies intentionally omitted here — add once auth roles are defined.)

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- The FastAPI backend connects as the table OWNER (postgres) and BYPASSES RLS,
-- so the app is unaffected. Enabling RLS with NO policies denies the auto-
-- exposed PostgREST roles (anon / authenticated) — sealing the public API door.
-- Add policies later only if the browser talks to Supabase directly.
-- ===========================================================================
alter table stores                  enable row level security;
alter table staff                   enable row level security;
alter table users                   enable row level security;
alter table store_tables            enable row level security;
alter table table_sessions          enable row level security;
alter table menu_categories         enable row level security;
alter table menu_units              enable row level security;
alter table menu_unit_availability  enable row level security;
alter table tax_profiles            enable row level security;
alter table promotions              enable row level security;
alter table order_statuses          enable row level security;
alter table orders                  enable row level security;
alter table order_items             enable row level security;
alter table order_item_selections   enable row level security;
alter table payments                enable row level security;
alter table order_status_events     enable row level security;
alter table order_feedback          enable row level security;

-- Views aren't covered by RLS — revoke them from the public API roles too.
revoke all on mv_order_item_facts, mv_daily_sales, mv_product_sales,
              mv_payment_mix, mv_table_turnover
  from anon, authenticated;
