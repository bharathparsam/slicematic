-- SliceMatic ops + AI migration (idempotent). Run after sql/schema.sql:
--   psql -d slicematic -f sql/migrations/001_ops_ai.sql

-- ---------------------------------------------------------------------------
-- Item-level kitchen statuses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_item_statuses (
  id         smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort_order smallint NOT NULL
);

INSERT INTO order_item_statuses (code, name, sort_order) VALUES
  ('queued',     'Queued',     10),
  ('assigned',   'Assigned',   20),
  ('preparing',  'Preparing',  30),
  ('ready',      'Ready',      40),
  ('served',     'Served',     50),
  ('cancelled',  'Cancelled',  60)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS status_id smallint REFERENCES order_item_statuses(id),
  ADD COLUMN IF NOT EXISTS assigned_staff_id bigint REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS preparing_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS served_at timestamptz;

CREATE TABLE IF NOT EXISTS order_item_status_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_item_id   bigint NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  from_status_id  smallint REFERENCES order_item_statuses(id),
  to_status_id    smallint NOT NULL REFERENCES order_item_statuses(id),
  actor_staff_id  bigint REFERENCES staff(id),
  reason          text,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_events_item ON order_item_status_events (order_item_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items (status_id);

-- Backfill existing items: settled orders -> served, open -> queued
DO $$
DECLARE
  queued_id smallint;
  served_id smallint;
BEGIN
  SELECT id INTO queued_id FROM order_item_statuses WHERE code = 'queued';
  SELECT id INTO served_id FROM order_item_statuses WHERE code = 'served';

  UPDATE order_items oi
  SET
    status_id = CASE
      WHEN s.is_settled OR s.is_cancelled THEN served_id
      ELSE queued_id
    END,
    queued_at = COALESCE(oi.queued_at, o.created_at),
    served_at = CASE
      WHEN s.is_settled THEN COALESCE(oi.served_at, o.completed_at, o.created_at)
      ELSE oi.served_at
    END
  FROM orders o
  JOIN order_statuses s ON s.id = o.status_id
  WHERE oi.order_id = o.id AND oi.status_id IS NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Staff PIN + demo seed
-- ---------------------------------------------------------------------------
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin char(4);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancelled_from_status_id smallint REFERENCES order_statuses(id);

-- ---------------------------------------------------------------------------
-- AI persistence
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_briefings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id      bigint NOT NULL REFERENCES stores(id),
  business_date date NOT NULL,
  kpi_snapshot  jsonb NOT NULL,
  summary_text  text NOT NULL,
  model         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, business_date)
);

CREATE TABLE IF NOT EXISTS ai_chat_threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     bigint NOT NULL REFERENCES stores(id),
  briefing_id  bigint REFERENCES ai_briefings(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id       uuid NOT NULL REFERENCES ai_chat_threads(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         text NOT NULL,
  sql_executed    text,
  query_row_count int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_thread ON ai_chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Reporting MVs (ops analytics)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_item_prep_stats AS
SELECT
  o.store_id,
  sel.menu_unit_id,
  sel.item_name AS pizza_name,
  count(*) AS items_completed,
  round(avg(extract(epoch FROM (oi.ready_at - oi.queued_at)) / 60.0), 1) AS avg_prep_minutes,
  round((percentile_cont(0.9) WITHIN GROUP (
    ORDER BY extract(epoch FROM (oi.ready_at - oi.queued_at)) / 60.0
  ))::numeric, 1) AS p90_prep_minutes
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN order_item_selections sel ON sel.order_item_id = oi.id AND sel.role = 'pizza'
JOIN order_statuses s ON s.id = o.status_id
WHERE oi.ready_at IS NOT NULL AND oi.queued_at IS NOT NULL
  AND s.is_settled
GROUP BY o.store_id, sel.menu_unit_id, sel.item_name;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_cancellation_items AS
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

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_cancellation_stages AS
SELECT
  o.store_id,
  fs.code AS cancelled_from_stage,
  count(*) AS cancel_count
FROM orders o
JOIN order_statuses s ON s.id = o.status_id
JOIN order_status_events e ON e.order_id = o.id
JOIN order_statuses ts ON ts.id = e.to_status_id AND ts.code = 'cancelled'
LEFT JOIN order_statuses fs ON fs.id = e.from_status_id
WHERE s.is_cancelled
GROUP BY o.store_id, fs.code;

CREATE OR REPLACE FUNCTION refresh_reporting() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_order_item_facts;
  REFRESH MATERIALIZED VIEW mv_daily_sales;
  REFRESH MATERIALIZED VIEW mv_product_sales;
  REFRESH MATERIALIZED VIEW mv_payment_mix;
  REFRESH MATERIALIZED VIEW mv_table_turnover;
  REFRESH MATERIALIZED VIEW mv_item_prep_stats;
  REFRESH MATERIALIZED VIEW mv_cancellation_items;
  REFRESH MATERIALIZED VIEW mv_cancellation_stages;
END;
$$ LANGUAGE plpgsql;

-- Seed staff after store exists (uses first store row)
DO $$
DECLARE
  sid bigint;
BEGIN
  SELECT id INTO sid FROM stores ORDER BY id LIMIT 1;
  IF sid IS NULL THEN
    INSERT INTO stores (name, timezone, day_cutoff)
    VALUES ('SliceMatic Delhi', 'Asia/Kolkata', '00:00')
    RETURNING id INTO sid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM staff WHERE store_id = sid AND full_name = 'Raj Kumar') THEN
    INSERT INTO staff (store_id, full_name, role, pin, is_active) VALUES
      (sid, 'Raj Kumar',   'staff',   '1234', true),
      (sid, 'Priya Singh', 'staff',   '2345', true),
      (sid, 'Amit Sharma', 'manager', '3456', true),
      (sid, 'Neha Verma',  'staff',   '4567', true);
  END IF;
END $$;

-- Read-only role for COO chat (optional — set COO_DATABASE_URL in backend/.env)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coo_readonly') THEN
    CREATE ROLE coo_readonly LOGIN PASSWORD 'coo_readonly_dev';
  END IF;
END $$;

GRANT CONNECT ON DATABASE slicematic TO coo_readonly;
GRANT USAGE ON SCHEMA public TO coo_readonly;

GRANT SELECT ON
  mv_daily_sales, mv_product_sales, mv_payment_mix, mv_table_turnover,
  mv_order_item_facts, mv_item_prep_stats, mv_cancellation_items, mv_cancellation_stages,
  orders, order_items, order_item_selections, order_item_status_events,
  table_sessions, store_tables, order_status_events, order_statuses, order_item_statuses,
  staff, stores, users, payments
TO coo_readonly;
