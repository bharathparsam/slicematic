"""Kitchen queue API — item-level status transitions and order roll-up."""

from db import db_cursor
from queries import (
    OrderNotFoundError,
    ensure_store,
    get_item_status_id,
    get_status_id,
    log_item_status_event,
)

# Allowed item status transitions (from_code -> set of to_codes)
ITEM_TRANSITIONS = {
    'queued': {'assigned'},
    'assigned': {'preparing', 'queued'},
    'preparing': {'ready'},
    'ready': {'served'},
    'served': set(),
    'cancelled': set(),
}

ITEM_TIMESTAMP_COLUMNS = {
    'assigned': 'assigned_at',
    'preparing': 'preparing_at',
    'ready': 'ready_at',
    'served': 'served_at',
}


class ItemNotFoundError(LookupError):
    pass


class InvalidTransitionError(ValueError):
    pass


class StaffNotFoundError(LookupError):
    pass


def verify_staff_pin(staff_id: int, pin: str) -> dict | None:
    """Return staff id, full_name, role when PIN matches an active store member."""
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        cur.execute(
            '''
            SELECT id, full_name, role
            FROM staff
            WHERE id = %s AND pin = %s AND is_active = true AND store_id = %s
            ''',
            (staff_id, pin, store_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            'id': row['id'],
            'full_name': row['full_name'],
            'role': row['role'],
            'has_pin': True,
        }


def list_staff() -> list[dict]:
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        cur.execute(
            '''
            SELECT id, full_name, role, pin
            FROM staff
            WHERE store_id = %s AND is_active = true
            ORDER BY full_name
            ''',
            (store_id,),
        )
        return [
            {
                'id': row['id'],
                'full_name': row['full_name'],
                'role': row['role'],
                'has_pin': row['pin'] is not None,
            }
            for row in cur.fetchall()
        ]


def rollup_order_status(cur, order_id: int, actor_staff_id: int | None = None) -> None:
    """Derive order header status from item statuses."""
    cur.execute(
        '''
        SELECT ois.code
        FROM order_items oi
        JOIN order_item_statuses ois ON ois.id = oi.status_id
        WHERE oi.order_id = %s
        ''',
        (order_id,),
    )
    codes = [row['code'] for row in cur.fetchall()]
    if not codes:
        return

    active = [c for c in codes if c not in ('cancelled',)]
    if not active:
        return

    if all(c == 'served' for c in active):
        target_code = 'served'
    elif all(c in ('ready', 'served') for c in active):
        target_code = 'ready'
    elif any(c == 'preparing' for c in active):
        target_code = 'preparing'
    elif any(c == 'assigned' for c in active):
        target_code = 'preparing'
    else:
        target_code = 'placed'

    cur.execute(
        '''
        SELECT o.status_id, s.code AS status_code
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.id = %s
        ''',
        (order_id,),
    )
    order_row = cur.fetchone()
    if not order_row or order_row['status_code'] in ('completed', 'cancelled'):
        return

    if order_row['status_code'] == target_code:
        if target_code == 'ready':
            cur.execute(
                '''
                UPDATE orders SET ready_at = COALESCE(ready_at, now())
                WHERE id = %s
                ''',
                (order_id,),
            )
        return

    target_status_id = get_status_id(cur, target_code)
    from_status_id = order_row['status_id']

    cur.execute(
        'UPDATE orders SET status_id = %s WHERE id = %s',
        (target_status_id, order_id),
    )
    if target_code == 'ready':
        cur.execute(
            '''
            UPDATE orders SET ready_at = COALESCE(ready_at, now())
            WHERE id = %s
            ''',
            (order_id,),
        )

    cur.execute(
        '''
        INSERT INTO order_status_events (
          order_id, from_status_id, to_status_id, actor_staff_id
        )
        VALUES (%s, %s, %s, %s)
        ''',
        (order_id, from_status_id, target_status_id, actor_staff_id),
    )


def get_kitchen_queue() -> list[dict]:
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        cur.execute(
            '''
            SELECT
              oi.id AS item_id,
              oi.line_no,
              oi.quantity,
              oi.queued_at,
              oi.assigned_at,
              oi.preparing_at,
              oi.ready_at,
              ois.code AS status_code,
              ois.name AS status_name,
              o.order_code,
              o.notes AS table_label,
              o.public_id::text AS order_id,
              st.full_name AS assigned_staff,
              oi.assigned_staff_id,
              (
                SELECT sel.item_name
                FROM order_item_selections sel
                WHERE sel.order_item_id = oi.id AND sel.role = 'pizza'
                LIMIT 1
              ) AS pizza_name,
              (
                SELECT sel.item_name
                FROM order_item_selections sel
                WHERE sel.order_item_id = oi.id AND sel.role = 'base'
                LIMIT 1
              ) AS base_name,
              COALESCE(
                (
                  SELECT json_agg(sel.item_name ORDER BY sel.id)
                  FROM order_item_selections sel
                  WHERE sel.order_item_id = oi.id AND sel.role = 'topping'
                ),
                '[]'::json
              ) AS toppings
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN order_item_statuses ois ON ois.id = oi.status_id
            JOIN order_statuses os ON os.id = o.status_id
            LEFT JOIN staff st ON st.id = oi.assigned_staff_id
            WHERE o.store_id = %s
              AND os.is_cancelled = false
              AND os.code <> 'completed'
              AND ois.code NOT IN ('served', 'cancelled')
            ORDER BY oi.queued_at ASC NULLS LAST, o.order_code, oi.line_no
            ''',
            (store_id,),
        )
        rows = cur.fetchall()

    items = []
    for row in rows:
        items.append({
            'item_id': row['item_id'],
            'line_no': row['line_no'],
            'quantity': row['quantity'],
            'status_code': row['status_code'],
            'status_name': row['status_name'],
            'order_code': row['order_code'],
            'order_id': row['order_id'],
            'table_label': row['table_label'],
            'pizza_name': row['pizza_name'],
            'base_name': row['base_name'],
            'toppings': row['toppings'] or [],
            'assigned_staff_id': row['assigned_staff_id'],
            'assigned_staff': row['assigned_staff'],
            'queued_at': row['queued_at'].isoformat() if row['queued_at'] else None,
            'elapsed_seconds': _elapsed_seconds(row['queued_at']),
        })
    return items


def _elapsed_seconds(queued_at) -> int | None:
    if not queued_at:
        return None
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    if queued_at.tzinfo is None:
        queued_at = queued_at.replace(tzinfo=timezone.utc)
    return int((now - queued_at).total_seconds())


def assign_kitchen_item(item_id: int, staff_id: int) -> dict:
    return transition_kitchen_item(item_id, 'assigned', staff_id)


def transition_kitchen_item(item_id: int, to_status: str, staff_id: int) -> dict:
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT
              oi.id,
              oi.order_id,
              oi.status_id,
              ois.code AS from_code,
              o.store_id
            FROM order_items oi
            JOIN order_item_statuses ois ON ois.id = oi.status_id
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.id = %s
            ''',
            (item_id,),
        )
        item = cur.fetchone()
        if not item:
            raise ItemNotFoundError(f'Kitchen item {item_id} not found')

        cur.execute(
            'SELECT id FROM staff WHERE id = %s AND is_active = true',
            (staff_id,),
        )
        if not cur.fetchone():
            raise StaffNotFoundError(f'Staff {staff_id} not found')

        from_code = item['from_code']
        allowed = ITEM_TRANSITIONS.get(from_code, set())
        if to_status not in allowed:
            raise InvalidTransitionError(
                f"Cannot transition item from '{from_code}' to '{to_status}'"
            )

        to_status_id = get_item_status_id(cur, to_status)
        from_status_id = item['status_id']

        updates = ['status_id = %s']
        params: list = [to_status_id]

        if to_status == 'assigned':
            updates.append('assigned_staff_id = %s')
            params.append(staff_id)

        ts_col = ITEM_TIMESTAMP_COLUMNS.get(to_status)
        if ts_col:
            updates.append(f'{ts_col} = now()')

        params.append(item_id)
        cur.execute(
            f"UPDATE order_items SET {', '.join(updates)} WHERE id = %s",
            params,
        )

        log_item_status_event(
            cur, item_id, from_status_id, to_status_id, actor_staff_id=staff_id
        )
        rollup_order_status(cur, item['order_id'], actor_staff_id=staff_id)

    return {
        'item_id': item_id,
        'status_code': to_status,
        'order_id': item['order_id'],
    }
