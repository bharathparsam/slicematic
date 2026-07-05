import os
import time
import uuid
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from db import db_cursor

STORE_NAME = os.getenv('STORE_NAME', 'SliceMatic Delhi')

TWO_DP = Decimal('0.01')


def round2(value: Decimal) -> Decimal:
    return value.quantize(TWO_DP, rounding=ROUND_HALF_UP)


# --- Reporting freshness -----------------------------------------------------
# The COO chat queries the mv_* materialized views (snapshots), so they must be
# refreshed to reflect new orders / kitchen activity — otherwise a correct query
# returns 0 rows and the assistant says "no data". Refresh at most once per TTL
# window so back-to-back questions don't each pay the cost. Best-effort: a failed
# refresh never breaks the caller.
_LAST_REPORTING_REFRESH = 0.0
_REPORTING_REFRESH_TTL = float(os.getenv('REPORTING_REFRESH_TTL', '20'))


def ensure_reporting_fresh(force: bool = False) -> None:
    global _LAST_REPORTING_REFRESH
    now = time.monotonic()
    if not force and (now - _LAST_REPORTING_REFRESH) < _REPORTING_REFRESH_TTL:
        return
    try:
        with db_cursor() as (_, cur):
            cur.execute('SELECT refresh_reporting()')
        _LAST_REPORTING_REFRESH = now
    except Exception:
        # Stale data is better than a failed chat request.
        pass


def ensure_store(cur) -> int:
    cur.execute('SELECT id FROM stores WHERE name = %s LIMIT 1', (STORE_NAME,))
    row = cur.fetchone()
    if row:
        return row['id']

    cur.execute(
        '''
        INSERT INTO stores (name, timezone, day_cutoff)
        VALUES (%s, 'Asia/Kolkata', '00:00')
        RETURNING id
        ''',
        (STORE_NAME,),
    )
    return cur.fetchone()['id']


def get_status_id(cur, code: str) -> int:
    cur.execute('SELECT id FROM order_statuses WHERE code = %s', (code,))
    row = cur.fetchone()
    if not row:
        raise RuntimeError(f"Missing order status '{code}' — run sql/schema.sql first")
    return row['id']


def get_item_status_id(cur, code: str) -> int:
    cur.execute('SELECT id FROM order_item_statuses WHERE code = %s', (code,))
    row = cur.fetchone()
    if not row:
        raise RuntimeError(
            f"Missing item status '{code}' — run sql/schema.sql first"
        )
    return row['id']


def log_item_status_event(
    cur,
    order_item_id: int,
    from_status_id: int | None,
    to_status_id: int,
    actor_staff_id: int | None = None,
    reason: str | None = None,
) -> None:
    cur.execute(
        '''
        INSERT INTO order_item_status_events (
          order_item_id, from_status_id, to_status_id, actor_staff_id, reason
        )
        VALUES (%s, %s, %s, %s, %s)
        ''',
        (order_item_id, from_status_id, to_status_id, actor_staff_id, reason),
    )


def upsert_user(cur, phone: str, full_name: str) -> int:
    cur.execute(
        '''
        INSERT INTO users (phone, full_name)
        VALUES (%s, %s)
        ON CONFLICT (phone) DO UPDATE
          SET full_name = EXCLUDED.full_name,
              updated_at = now()
        RETURNING id
        ''',
        (phone, full_name),
    )
    return cur.fetchone()['id']


def next_order_ticket(cur, store_id: int) -> tuple:
    cur.execute(
        '''
        SELECT
          (now() AT TIME ZONE 'Asia/Kolkata')::date AS business_date,
          COALESCE(
            MAX(order_sequence) FILTER (
              WHERE business_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
            ),
            0
          ) + 1 AS next_sequence
        FROM orders
        WHERE store_id = %s
        ''',
        (store_id,),
    )
    row = cur.fetchone()
    business_date = row['business_date']
    order_sequence = row['next_sequence']
    order_code = f'SM-{str(order_sequence).zfill(4)}'
    return business_date, order_sequence, order_code


def get_or_create_store_table(cur, store_id: int, label: str) -> int:
    cur.execute(
        '''
        SELECT id FROM store_tables
        WHERE store_id = %s AND label = %s
        LIMIT 1
        ''',
        (store_id, label),
    )
    row = cur.fetchone()
    if row:
        return row['id']

    cur.execute(
        '''
        INSERT INTO store_tables (store_id, label)
        VALUES (%s, %s)
        RETURNING id
        ''',
        (store_id, label),
    )
    return cur.fetchone()['id']


def ensure_table_session(cur, store_id: int, table_label: str | None, user_id: int) -> int | None:
    if not table_label:
        return None

    table_id = get_or_create_store_table(cur, store_id, table_label)

    cur.execute(
        'SELECT current_session_id FROM store_tables WHERE id = %s',
        (table_id,),
    )
    row = cur.fetchone()
    if row and row['current_session_id']:
        return row['current_session_id']

    cur.execute(
        '''
        INSERT INTO table_sessions (store_id, table_id, user_id, status)
        VALUES (%s, %s, %s, 'open')
        RETURNING id
        ''',
        (store_id, table_id, user_id),
    )
    session_id = cur.fetchone()['id']

    cur.execute(
        'UPDATE store_tables SET current_session_id = %s WHERE id = %s',
        (session_id, table_id),
    )
    return session_id


class OrderNotFoundError(LookupError):
    pass


class OrderAlreadyTerminalError(ValueError):
    pass


class OrderAlreadyRatedError(ValueError):
    pass


class TableAlreadyExistsError(ValueError):
    pass


class TableInUseError(ValueError):
    pass


def list_store_tables() -> list[dict]:
    '''All tables for the store (active + removed), with reservation + occupancy
    state, so the admin table manager and the customer picker can each filter.'''
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        cur.execute(
            '''
            SELECT id, label, is_blocked, is_active,
                   (current_session_id IS NOT NULL) AS in_use
            FROM store_tables
            WHERE store_id = %s
            ORDER BY id
            ''',
            (store_id,),
        )
        rows = cur.fetchall()

    return [
        {
            'id': row['id'],
            'label': row['label'],
            'is_blocked': row['is_blocked'],
            'is_active': row['is_active'],
            'in_use': row['in_use'],
        }
        for row in rows
    ]


def create_store_table(table_number: str, label_prefix: str = 'Table') -> dict:
    prefix = label_prefix.strip() or 'Table'
    label = f'{prefix} {table_number}'

    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        cur.execute(
            'SELECT id, is_active FROM store_tables WHERE store_id = %s AND label = %s LIMIT 1',
            (store_id, label),
        )
        existing = cur.fetchone()
        if existing:
            if existing['is_active']:
                raise TableAlreadyExistsError(f'{label} already exists')
            # Re-add a previously removed table.
            cur.execute(
                '''UPDATE store_tables
                   SET is_active = true, is_blocked = false, updated_at = now()
                   WHERE id = %s RETURNING id, label''',
                (existing['id'],),
            )
            row = cur.fetchone()
            return {'id': row['id'], 'label': row['label']}

        cur.execute(
            'INSERT INTO store_tables (store_id, label) VALUES (%s, %s) RETURNING id, label',
            (store_id, label),
        )
        row = cur.fetchone()

    return {'id': row['id'], 'label': row['label']}


def set_table_blocked(label: str, blocked: bool) -> dict:
    '''Reserve/unreserve a table by label. Creates the row if the table only
    existed in the config file, so config tables are manageable too.'''
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        table_id = get_or_create_store_table(cur, store_id, label)
        cur.execute(
            '''UPDATE store_tables SET is_blocked = %s, updated_at = now()
               WHERE id = %s RETURNING id, label, is_blocked, is_active''',
            (blocked, table_id),
        )
        row = cur.fetchone()
    return {
        'id': row['id'], 'label': row['label'],
        'is_blocked': row['is_blocked'], 'is_active': row['is_active'],
    }


def remove_store_table(label: str) -> dict:
    '''Soft-remove a table (is_active=false). Refuses if a guest is seated so we
    never orphan an open order.'''
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        table_id = get_or_create_store_table(cur, store_id, label)
        cur.execute('SELECT current_session_id FROM store_tables WHERE id = %s', (table_id,))
        row = cur.fetchone()
        if row and row['current_session_id']:
            raise TableInUseError(f'{label} has an open order — complete or cancel it first')
        cur.execute(
            '''UPDATE store_tables SET is_active = false, is_blocked = false, updated_at = now()
               WHERE id = %s RETURNING id, label''',
            (table_id,),
        )
        row = cur.fetchone()
    return {'id': row['id'], 'label': row['label']}


def list_menu_availability(item_type: str = 'pizza') -> list[dict]:
    '''Availability overlay rows for a menu item type. Only toggled items have a
    row; the frontend treats any id without a row (or is_sold_out=false) as
    available.'''
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        cur.execute(
            '''
            SELECT item_id, item_name, is_sold_out
            FROM menu_availability
            WHERE store_id = %s AND item_type = %s
            ORDER BY item_id
            ''',
            (store_id, item_type),
        )
        rows = cur.fetchall()

    return [
        {
            'item_id': row['item_id'],
            'item_name': row['item_name'],
            'is_sold_out': row['is_sold_out'],
        }
        for row in rows
    ]


def set_menu_availability(
    item_id: str, is_sold_out: bool, item_type: str = 'pizza', item_name: str | None = None
) -> dict:
    '''Upsert one item's sold-out flag, keyed by (store, type, id).'''
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        cur.execute(
            '''
            INSERT INTO menu_availability (store_id, item_type, item_id, item_name, is_sold_out)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (store_id, item_type, item_id) DO UPDATE
              SET is_sold_out = EXCLUDED.is_sold_out,
                  item_name   = COALESCE(EXCLUDED.item_name, menu_availability.item_name),
                  updated_at  = now()
            RETURNING item_id, item_name, is_sold_out
            ''',
            (store_id, item_type, item_id, item_name, is_sold_out),
        )
        row = cur.fetchone()

    return {
        'item_id': row['item_id'],
        'item_name': row['item_name'],
        'is_sold_out': row['is_sold_out'],
    }


def complete_order(order_public_id: str) -> dict:
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT
              o.id,
              o.public_id::text AS order_id,
              o.order_code,
              o.session_id,
              o.notes AS table,
              o.status_id,
              s.code AS status_code,
              s.is_open,
              s.is_cancelled
            FROM orders o
            JOIN order_statuses s ON s.id = o.status_id
            WHERE o.public_id = %s
            ''',
            (order_public_id,),
        )
        row = cur.fetchone()
        if not row:
            raise OrderNotFoundError(f'Order {order_public_id} not found')

        if row['status_code'] == 'completed' or row['is_cancelled']:
            raise OrderAlreadyTerminalError('Order is already completed or cancelled')

        completed_status_id = get_status_id(cur, 'completed')
        from_status_id = row['status_id']
        session_id = row['session_id']

        cur.execute(
            '''
            UPDATE orders
            SET status_id = %s, completed_at = now()
            WHERE id = %s
            ''',
            (completed_status_id, row['id']),
        )

        cur.execute(
            '''
            INSERT INTO order_status_events (order_id, from_status_id, to_status_id)
            VALUES (%s, %s, %s)
            ''',
            (row['id'], from_status_id, completed_status_id),
        )

        release_table_if_session_empty(cur, session_id, row['id'])

    return {
        'order_id': row['order_id'],
        'order_code': row['order_code'],
        'status': 'completed',
        'table': row['table'],
    }


def rate_order(order_public_id: str, rating: int) -> dict:
    """Store a one-time 1–5 guest rating for an active order."""
    if rating not in (1, 2, 3, 4, 5):
        raise ValueError('Rating must be between 1 and 5')

    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT
              o.id,
              o.public_id::text AS order_id,
              o.order_code,
              o.notes AS table,
              s.code AS status_code,
              s.is_cancelled
            FROM orders o
            JOIN order_statuses s ON s.id = o.status_id
            WHERE o.public_id = %s
            ''',
            (order_public_id,),
        )
        row = cur.fetchone()
        if not row:
            raise OrderNotFoundError(f'Order {order_public_id} not found')

        if row['status_code'] == 'completed' or row['is_cancelled']:
            raise OrderAlreadyTerminalError('Cannot rate a completed or cancelled order')

        cur.execute(
            'SELECT 1 FROM order_feedback WHERE order_id = %s',
            (row['id'],),
        )
        if cur.fetchone():
            raise OrderAlreadyRatedError('This order has already been rated')

        cur.execute(
            '''
            INSERT INTO order_feedback (order_id, rating)
            VALUES (%s, %s)
            RETURNING rating
            ''',
            (row['id'], rating),
        )
        saved = cur.fetchone()['rating']

    return {
        'order_id': row['order_id'],
        'order_code': row['order_code'],
        'table': row['table'],
        'rating': saved,
    }


def cancel_order(order_public_id: str, reason: str | None = None) -> dict:
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT
              o.id,
              o.public_id::text AS order_id,
              o.order_code,
              o.session_id,
              o.notes AS table,
              o.status_id,
              s.code AS status_code,
              s.is_cancelled
            FROM orders o
            JOIN order_statuses s ON s.id = o.status_id
            WHERE o.public_id = %s
            ''',
            (order_public_id,),
        )
        row = cur.fetchone()
        if not row:
            raise OrderNotFoundError(f'Order {order_public_id} not found')
        if row['status_code'] == 'completed' or row['is_cancelled']:
            raise OrderAlreadyTerminalError('Order is already completed or cancelled')

        cancelled_status_id = get_status_id(cur, 'cancelled')
        cur.execute(
            '''
            UPDATE orders SET
              status_id = %s,
              cancelled_at = now(),
              cancel_reason = %s,
              cancelled_from_status_id = %s
            WHERE id = %s
            ''',
            (cancelled_status_id, reason, row['status_id'], row['id']),
        )
        # Void open kitchen items on cancel.
        try:
            cancelled_item_status_id = get_item_status_id(cur, 'cancelled')
            cur.execute(
                '''
                SELECT oi.id, oi.status_id
                FROM order_items oi
                JOIN order_item_statuses ois ON ois.id = oi.status_id
                WHERE oi.order_id = %s AND ois.code NOT IN ('served', 'cancelled')
                ''',
                (row['id'],),
            )
            for item_row in cur.fetchall():
                cur.execute(
                    'UPDATE order_items SET status_id = %s WHERE id = %s',
                    (cancelled_item_status_id, item_row['id']),
                )
                log_item_status_event(
                    cur,
                    item_row['id'],
                    item_row['status_id'],
                    cancelled_item_status_id,
                    reason=reason,
                )
        except RuntimeError:
            pass
        cur.execute(
            '''
            INSERT INTO order_status_events (order_id, from_status_id, to_status_id, reason)
            VALUES (%s, %s, %s, %s)
            ''',
            (row['id'], row['status_id'], cancelled_status_id, reason),
        )
        # A cancelled order frees its table (unless another open order shares the session).
        release_table_if_session_empty(cur, row['session_id'], row['id'])

    return {
        'order_id': row['order_id'],
        'order_code': row['order_code'],
        'status': 'cancelled',
        'table': row['table'],
    }


def update_order(order_public_id: str, payload) -> dict:
    """Full edit of an existing (non-terminal) order: recompute + replace lines."""
    totals = _compute_totals(payload.items)

    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT
              o.id,
              o.order_code,
              o.store_id,
              o.session_id,
              o.notes AS table,
              s.code AS status_code,
              s.is_cancelled
            FROM orders o
            JOIN order_statuses s ON s.id = o.status_id
            WHERE o.public_id = %s
            ''',
            (order_public_id,),
        )
        row = cur.fetchone()
        if not row:
            raise OrderNotFoundError(f'Order {order_public_id} not found')
        if row['status_code'] == 'completed' or row['is_cancelled']:
            raise OrderAlreadyTerminalError('Cannot modify a completed or cancelled order')

        order_id = row['id']
        store_id = row['store_id']
        user_id = upsert_user(cur, payload.phone, payload.name)

        # Table change: move to the new table's session and free the old one.
        old_table = row['table']
        old_session_id = row['session_id']
        new_table = payload.table or None
        session_id = old_session_id
        if new_table != (old_table or None):
            session_id = ensure_table_session(cur, store_id, new_table, user_id)
            if old_session_id and old_session_id != session_id:
                release_table_if_session_empty(cur, old_session_id, order_id)

        cur.execute(
            '''
            UPDATE orders SET
              session_id = %s,
              user_id = %s,
              customer_name = %s,
              customer_phone = %s,
              subtotal = %s,
              discount_amount = %s,
              taxable_amount = %s,
              cgst_amount = %s,
              sgst_amount = %s,
              tax_amount = %s,
              grand_total = %s,
              notes = %s,
              updated_at = now()
            WHERE id = %s
            ''',
            (
                session_id,
                user_id,
                payload.name,
                payload.phone,
                totals['subtotal'],
                totals['discount_total'],
                totals['taxable_amount'],
                totals['half_gst'],
                totals['half_gst'],
                totals['tax_total'],
                totals['grand_total'],
                new_table,
                order_id,
            ),
        )

        # Replace lines (cascade drops selections) and the payment row.
        cur.execute('DELETE FROM order_items WHERE order_id = %s', (order_id,))
        _insert_order_lines(cur, store_id, order_id, payload.items)

        cur.execute('DELETE FROM payments WHERE order_id = %s', (order_id,))
        cur.execute(
            '''
            INSERT INTO payments (order_id, method, status, amount)
            VALUES (%s, %s::payment_method, 'captured', %s)
            ''',
            (order_id, payload.payment_type, totals['grand_total']),
        )

    return {
        'order_id': order_public_id,
        'order_code': row['order_code'],
        'grand_total': totals['grand_total'],
    }


def map_status_for_app(status_code: str, is_cancelled: bool) -> str:
    if is_cancelled or status_code == 'cancelled':
        return 'cancelled'
    if status_code == 'completed':
        return 'completed'
    return 'active'


def get_or_create_menu_unit(cur, store_id: int, name: str, item_type: str, price: Decimal) -> int:
    cur.execute(
        '''
        SELECT id
        FROM menu_units
        WHERE store_id = %s
          AND item_type = %s::menu_item_type
          AND lower(name) = lower(%s)
        LIMIT 1
        ''',
        (store_id, item_type, name),
    )
    row = cur.fetchone()
    if row:
        return row['id']

    sku = f'api-{item_type}-{uuid.uuid4().hex[:8]}'
    cur.execute(
        '''
        INSERT INTO menu_units (store_id, item_type, sku, name, price)
        VALUES (%s, %s::menu_item_type, %s, %s, %s)
        RETURNING id
        ''',
        (store_id, item_type, sku, name, round2(price)),
    )
    return cur.fetchone()['id']


def _compute_totals(items) -> dict:
    """Aggregate line math the same way the frontend billing does."""
    subtotal = Decimal('0')
    discount_total = Decimal('0')
    tax_total = Decimal('0')
    for item in items:
        line_taxable = round2(item.price_wo_gst * item.quantity)
        line_discount = round2(item.line_discount)
        subtotal += round2(line_taxable + line_discount)
        discount_total += line_discount
        tax_total += round2(item.gst)
    taxable_amount = round2(subtotal - discount_total)
    return {
        'subtotal': round2(subtotal),
        'discount_total': round2(discount_total),
        'tax_total': round2(tax_total),
        'taxable_amount': taxable_amount,
        'grand_total': round2(taxable_amount + tax_total),
        'half_gst': round2(tax_total / Decimal('2')),
    }


def _insert_order_lines(cur, store_id: int, order_id: int, items) -> None:
    """Insert order_items + their base/pizza/topping selections."""
    queued_status_id = get_item_status_id(cur, 'queued')
    for line_no, item in enumerate(items, start=1):
        line_taxable = round2(item.price_wo_gst * item.quantity)
        line_discount = round2(item.line_discount)
        line_subtotal = round2(line_taxable + line_discount)
        line_tax = round2(item.gst)
        line_total = round2(line_taxable + line_tax)
        unit_price = round2(item.price_wo_gst)

        cur.execute(
            '''
            INSERT INTO order_items (
              order_id, line_no, quantity, unit_price,
              line_subtotal, line_discount, line_tax, line_total,
              status_id, queued_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            RETURNING id
            ''',
            (order_id, line_no, item.quantity, unit_price,
             line_subtotal, line_discount, line_tax, line_total,
             queued_status_id),
        )
        order_item_id = cur.fetchone()['id']
        log_item_status_event(cur, order_item_id, None, queued_status_id)

        selections = [
            ('base', item.base, Decimal('0')),
            ('pizza', item.pizza_type, unit_price),
        ]
        for topping in item.toppings:
            selections.append(('topping', topping, Decimal('0')))

        for role, name, snap_price in selections:
            menu_unit_id = get_or_create_menu_unit(cur, store_id, name, role, snap_price)
            cur.execute(
                '''
                INSERT INTO order_item_selections (
                  order_item_id, menu_unit_id, role, item_name, unit_price, quantity
                )
                VALUES (%s, %s, %s::menu_item_type, %s, %s, 1)
                ''',
                (order_item_id, menu_unit_id, role, name, round2(snap_price)),
            )


def release_table_if_session_empty(cur, session_id, exclude_order_id=None) -> None:
    """Close the session + free its table once no OPEN orders remain on it."""
    if not session_id:
        return
    cur.execute(
        '''
        SELECT COUNT(*) AS open_orders
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.session_id = %s
          AND s.is_open = true
          AND o.id <> COALESCE(%s, -1)
        ''',
        (session_id, exclude_order_id),
    )
    if cur.fetchone()['open_orders'] == 0:
        cur.execute(
            "UPDATE table_sessions SET status = 'closed', closed_at = now() "
            "WHERE id = %s AND status = 'open'",
            (session_id,),
        )
        cur.execute(
            'UPDATE store_tables SET current_session_id = NULL WHERE current_session_id = %s',
            (session_id,),
        )


def create_order(payload) -> dict:
    order_public_id = uuid.uuid4()
    subtotal = Decimal('0')
    discount_total = Decimal('0')
    tax_total = Decimal('0')

    for item in payload.items:
        line_taxable = round2(item.price_wo_gst * item.quantity)
        line_discount = round2(item.line_discount)
        line_subtotal = round2(line_taxable + line_discount)
        line_tax = round2(item.gst)
        subtotal += line_subtotal
        discount_total += line_discount
        tax_total += line_tax

    taxable_amount = round2(subtotal - discount_total)
    grand_total = round2(taxable_amount + tax_total)
    half_gst = round2(tax_total / Decimal('2'))

    with db_cursor() as (conn, cur):
        store_id = ensure_store(cur)
        user_id = upsert_user(cur, payload.phone, payload.name)
        placed_status_id = get_status_id(cur, 'placed')
        business_date, order_sequence, order_code = next_order_ticket(cur, store_id)
        session_id = ensure_table_session(cur, store_id, payload.table, user_id)

        cur.execute(
            '''
            INSERT INTO orders (
              public_id,
              store_id,
              session_id,
              user_id,
              channel,
              status_id,
              business_date,
              order_sequence,
              order_code,
              customer_name,
              customer_phone,
              subtotal,
              discount_amount,
              taxable_amount,
              gst_rate,
              cgst_amount,
              sgst_amount,
              tax_amount,
              grand_total,
              notes,
              placed_at
            )
            VALUES (
              %s, %s, %s, %s, 'dine_in', %s, %s, %s, %s, %s, %s,
              %s, %s, %s, 0, %s, %s, %s, %s, %s, now()
            )
            RETURNING id
            ''',
            (
                str(order_public_id),
                store_id,
                session_id,
                user_id,
                placed_status_id,
                business_date,
                order_sequence,
                order_code,
                payload.name,
                payload.phone,
                round2(subtotal),
                round2(discount_total),
                taxable_amount,
                half_gst,
                half_gst,
                round2(tax_total),
                grand_total,
                payload.table,
            ),
        )
        order_id = cur.fetchone()['id']

        _insert_order_lines(cur, store_id, order_id, payload.items)

        cur.execute(
            '''
            INSERT INTO payments (order_id, method, status, amount)
            VALUES (%s, %s::payment_method, 'captured', %s)
            ''',
            (order_id, payload.payment_type, grand_total),
        )

        cur.execute(
            '''
            INSERT INTO order_status_events (order_id, to_status_id)
            VALUES (%s, %s)
            ''',
            (order_id, placed_status_id),
        )

    return {
        'order_id': str(order_public_id),
        'order_code': order_code,
        'grand_total': grand_total,
    }


def list_orders() -> list[dict]:
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT
              o.public_id::text AS order_id,
              o.order_code,
              o.customer_name AS name,
              o.customer_phone AS phone,
              o.notes AS table,
              o.subtotal,
              o.discount_amount AS discount,
              o.tax_amount AS gst,
              o.grand_total,
              o.created_at,
              s.code AS status_code,
              s.is_cancelled,
              (
                SELECT p.method::text
                FROM payments p
                WHERE p.order_id = o.id
                ORDER BY p.paid_at DESC
                LIMIT 1
              ) AS payment_type,
              (
                SELECT f.rating
                FROM order_feedback f
                WHERE f.order_id = o.id
              ) AS rating,
              COALESCE(
                (
                  SELECT json_agg(line ORDER BY (line->>'line_no')::int)
                  FROM (
                    SELECT json_build_object(
                      'id', oi.id,
                      'line_no', oi.line_no,
                      'quantity', oi.quantity,
                      'line_subtotal', oi.line_subtotal,
                      'line_discount', oi.line_discount,
                      'line_tax', oi.line_tax,
                      'line_total', oi.line_total,
                      'status_code', ois.code,
                      'assigned_staff', st.full_name,
                      'selections', COALESCE(
                        (
                          SELECT json_agg(
                            json_build_object(
                              'role', sel.role::text,
                              'name', sel.item_name,
                              'unit_price', sel.unit_price
                            )
                            ORDER BY sel.id
                          )
                          FROM order_item_selections sel
                          WHERE sel.order_item_id = oi.id
                        ),
                        '[]'::json
                      )
                    ) AS line
                    FROM order_items oi
                    LEFT JOIN order_item_statuses ois ON ois.id = oi.status_id
                    LEFT JOIN staff st ON st.id = oi.assigned_staff_id
                    WHERE oi.order_id = o.id
                  ) lines
                ),
                '[]'::json
              ) AS items
            FROM orders o
            JOIN order_statuses s ON s.id = o.status_id
            ORDER BY o.created_at DESC
            '''
        )
        rows = cur.fetchall()

    orders = []
    for row in rows:
        items = []
        for raw_item in row['items'] or []:
            selections = raw_item.get('selections') or []
            pizza_type = next((s['name'] for s in selections if s['role'] == 'pizza'), None)
            base = next((s['name'] for s in selections if s['role'] == 'base'), None)
            toppings = [s['name'] for s in selections if s['role'] == 'topping']

            items.append({
                'id': raw_item.get('id'),
                'line_no': raw_item['line_no'],
                'quantity': raw_item['quantity'],
                'line_subtotal': raw_item['line_subtotal'],
                'line_discount': raw_item['line_discount'],
                'line_tax': raw_item['line_tax'],
                'line_total': raw_item['line_total'],
                'status_code': raw_item.get('status_code'),
                'assigned_staff': raw_item.get('assigned_staff'),
                'pizza_type': pizza_type,
                'base': base,
                'toppings': toppings,
                'selections': selections,
            })

        orders.append({
            'order_id': row['order_id'],
            'order_code': row['order_code'],
            'name': row['name'],
            'phone': row['phone'],
            'table': row['table'],
            'status': map_status_for_app(row['status_code'], row['is_cancelled']),
            'subtotal': row['subtotal'],
            'discount': row['discount'],
            'gst': row['gst'],
            'grand_total': row['grand_total'],
            'payment_type': row['payment_type'],
            'created_at': row['created_at'].isoformat(),
            'rating': row['rating'],
            'items': items,
        })

    return orders


def orders_per_hour() -> dict:
    """Hourly order counts for the last 7 days (Asia/Kolkata), including zero-order hours."""
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            WITH hours AS (
              SELECT generate_series(
                date_trunc(
                  'hour',
                  (now() AT TIME ZONE 'Asia/Kolkata') - interval '6 days 23 hours'
                ),
                date_trunc('hour', now() AT TIME ZONE 'Asia/Kolkata'),
                interval '1 hour'
              ) AS order_hour
            ),
            counts AS (
              SELECT
                date_trunc('hour', o.created_at AT TIME ZONE 'Asia/Kolkata') AS order_hour,
                count(*)::int AS orders_count
              FROM orders o
              WHERE o.created_at >= (now() AT TIME ZONE 'Asia/Kolkata') - interval '7 days'
              GROUP BY 1
            )
            SELECT
              h.order_hour,
              COALESCE(c.orders_count, 0) AS orders_count
            FROM hours h
            LEFT JOIN counts c ON c.order_hour = h.order_hour
            ORDER BY h.order_hour
            '''
        )
        rows = cur.fetchall()

    points = [
        {
            'order_hour': row['order_hour'].isoformat(),
            'orders_count': row['orders_count'],
        }
        for row in rows
    ]
    return {'points': points, 'timezone': 'Asia/Kolkata'}


def top_products(limit: int = 8) -> dict:
    """Highest-sold pizzas (units + pre-tax revenue), non-cancelled orders."""
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT
              sel.item_name AS name,
              SUM(sel.quantity * oi.quantity)::int AS units_sold,
              SUM(sel.unit_price * sel.quantity * oi.quantity) AS revenue
            FROM order_item_selections sel
            JOIN order_items oi ON oi.id = sel.order_item_id
            JOIN orders o ON o.id = oi.order_id
            JOIN order_statuses s ON s.id = o.status_id
            WHERE sel.role = 'pizza' AND s.is_cancelled = false
            GROUP BY sel.item_name
            ORDER BY units_sold DESC, revenue DESC
            LIMIT %s
            ''',
            (limit,),
        )
        rows = cur.fetchall()

    return {
        'products': [
            {'name': r['name'], 'units_sold': r['units_sold'], 'revenue': r['revenue']}
            for r in rows
        ]
    }


def sales_daily(days: int = 7) -> dict:
    """Net/gross sales per business day for the last N days (zero-filled)."""
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            WITH day_series AS (
              SELECT generate_series(
                (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day'),
                (now() AT TIME ZONE 'Asia/Kolkata')::date,
                interval '1 day'
              )::date AS business_date
            ),
            sales AS (
              SELECT
                o.business_date,
                count(*)::int      AS orders_count,
                sum(o.subtotal)    AS gross_sales,
                sum(o.discount_amount) AS discounts,
                sum(o.grand_total) AS net_sales
              FROM orders o
              JOIN order_statuses s ON s.id = o.status_id
              WHERE s.is_cancelled = false
                AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
              GROUP BY o.business_date
            )
            SELECT
              d.business_date,
              COALESCE(x.orders_count, 0) AS orders_count,
              COALESCE(x.gross_sales, 0)  AS gross_sales,
              COALESCE(x.discounts, 0)    AS discounts,
              COALESCE(x.net_sales, 0)    AS net_sales
            FROM day_series d
            LEFT JOIN sales x ON x.business_date = d.business_date
            ORDER BY d.business_date
            ''',
            (days, days),
        )
        rows = cur.fetchall()

    return {
        'days': [
            {
                'business_date': r['business_date'].isoformat(),
                'orders_count': r['orders_count'],
                'gross_sales': r['gross_sales'],
                'discounts': r['discounts'],
                'net_sales': r['net_sales'],
            }
            for r in rows
        ]
    }


def ratings_daily(days: int = 7) -> dict:
    """Average guest rating per business day for the last N days (zero-filled)."""
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            WITH day_series AS (
              SELECT generate_series(
                (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day'),
                (now() AT TIME ZONE 'Asia/Kolkata')::date,
                interval '1 day'
              )::date AS business_date
            ),
            rated AS (
              SELECT
                o.business_date,
                count(f.id)::int AS ratings_count,
                round(avg(f.rating)::numeric, 2) AS avg_rating
              FROM order_feedback f
              JOIN orders o ON o.id = f.order_id
              WHERE o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
              GROUP BY o.business_date
            )
            SELECT
              d.business_date,
              COALESCE(r.ratings_count, 0) AS ratings_count,
              r.avg_rating
            FROM day_series d
            LEFT JOIN rated r ON r.business_date = d.business_date
            ORDER BY d.business_date
            ''',
            (days, days),
        )
        rows = cur.fetchall()

    return {
        'days': [
            {
                'business_date': r['business_date'].isoformat(),
                'ratings_count': r['ratings_count'],
                'avg_rating': r['avg_rating'],
            }
            for r in rows
        ]
    }


def sales_range(start: str, end: str) -> dict:
    """Net/gross sales + discounts per business day between two IST dates
    (inclusive), zero-filled. Raises ValueError on a bad or oversized range."""
    try:
        start_d = date.fromisoformat(start)
        end_d = date.fromisoformat(end)
    except (TypeError, ValueError) as exc:
        raise ValueError('Dates must be valid YYYY-MM-DD') from exc

    if start_d > end_d:
        raise ValueError('Start date must be on or before end date')
    if (end_d - start_d).days > 366:
        raise ValueError('Range must span 366 days or fewer')

    with db_cursor() as (_, cur):
        cur.execute(
            '''
            WITH day_series AS (
              SELECT generate_series(%s::date, %s::date, interval '1 day')::date AS business_date
            ),
            sales AS (
              SELECT
                o.business_date,
                count(*)::int          AS orders_count,
                sum(o.subtotal)        AS gross_sales,
                sum(o.discount_amount) AS discounts,
                sum(o.grand_total)     AS net_sales
              FROM orders o
              JOIN order_statuses s ON s.id = o.status_id
              WHERE s.is_cancelled = false
                AND o.business_date BETWEEN %s::date AND %s::date
              GROUP BY o.business_date
            )
            SELECT
              d.business_date,
              COALESCE(x.orders_count, 0) AS orders_count,
              COALESCE(x.gross_sales, 0)  AS gross_sales,
              COALESCE(x.discounts, 0)    AS discounts,
              COALESCE(x.net_sales, 0)    AS net_sales
            FROM day_series d
            LEFT JOIN sales x ON x.business_date = d.business_date
            ORDER BY d.business_date
            ''',
            (start, end, start, end),
        )
        rows = cur.fetchall()

    return {
        'days': [
            {
                'business_date': r['business_date'].isoformat(),
                'orders_count': r['orders_count'],
                'gross_sales': r['gross_sales'],
                'discounts': r['discounts'],
                'net_sales': r['net_sales'],
            }
            for r in rows
        ]
    }


def payment_mix(days: int = 7) -> dict:
    """Captured revenue by tender type for the last N days."""
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT
              p.method::text  AS method,
              count(*)::int   AS payments_count,
              sum(p.amount)   AS amount
            FROM payments p
            JOIN orders o ON o.id = p.order_id
            JOIN order_statuses s ON s.id = o.status_id
            WHERE p.status = 'captured'
              AND s.is_cancelled = false
              AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
            GROUP BY p.method
            ORDER BY amount DESC
            ''',
            (days,),
        )
        rows = cur.fetchall()

    return {
        'methods': [
            {'method': r['method'], 'payments_count': r['payments_count'], 'amount': r['amount']}
            for r in rows
        ]
    }


STAFF_ROLES = frozenset({'staff', 'manager', 'admin'})


class StaffNotFoundError(LookupError):
    pass


def _map_staff_row(row: dict) -> dict:
    return {
        'id': row['id'],
        'full_name': row['full_name'],
        'role': row['role'],
        'has_pin': row['pin'] is not None,
        'is_active': row['is_active'],
    }


def list_staff_admin(include_inactive: bool = True) -> list[dict]:
    """List staff for admin management (optionally includes deactivated rows)."""
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        active_clause = '' if include_inactive else 'AND is_active = true'
        cur.execute(
            f'''
            SELECT id, full_name, role, pin, is_active
            FROM staff
            WHERE store_id = %s {active_clause}
            ORDER BY is_active DESC, full_name
            ''',
            (store_id,),
        )
        return [_map_staff_row(row) for row in cur.fetchall()]


def create_staff(full_name: str, role: str = 'staff', pin: str | None = None) -> dict:
    cleaned_name = full_name.strip()
    role_key = role.strip().lower()
    if role_key not in STAFF_ROLES:
        raise ValueError(f'Invalid role: {role}')

    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        cur.execute(
            '''
            INSERT INTO staff (store_id, full_name, role, pin, is_active)
            VALUES (%s, %s, %s, %s, true)
            RETURNING id, full_name, role, pin, is_active
            ''',
            (store_id, cleaned_name, role_key, pin),
        )
        return _map_staff_row(cur.fetchone())


def update_staff(
    staff_id: int,
    *,
    full_name: str | None = None,
    role: str | None = None,
    pin: str | None = None,
    pin_set: bool = False,
    is_active: bool | None = None,
) -> dict:
    updates: list[str] = []
    params: list = []

    if full_name is not None:
        updates.append('full_name = %s')
        params.append(full_name.strip())
    if role is not None:
        role_key = role.strip().lower()
        if role_key not in STAFF_ROLES:
            raise ValueError(f'Invalid role: {role}')
        updates.append('role = %s')
        params.append(role_key)
    if pin_set:
        updates.append('pin = %s')
        params.append(pin)
    if is_active is not None:
        updates.append('is_active = %s')
        params.append(is_active)

    if not updates:
        raise ValueError('No fields to update')

    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        params.extend([staff_id, store_id])
        cur.execute(
            f'''
            UPDATE staff
            SET {', '.join(updates)}
            WHERE id = %s AND store_id = %s
            RETURNING id, full_name, role, pin, is_active
            ''',
            params,
        )
        row = cur.fetchone()
        if not row:
            raise StaffNotFoundError(f'Staff {staff_id} not found')
        return _map_staff_row(row)


def deactivate_staff(staff_id: int) -> dict:
    return update_staff(staff_id, is_active=False)
