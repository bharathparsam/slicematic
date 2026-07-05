"""Rule-based upsell suggestions for the customize sheet (R1–R3)."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from db import db_cursor
from queries import ensure_store

IST = ZoneInfo('Asia/Kolkata')

DEFAULT_CONFIG = {
    'lookback_days': {'pairing': 30, 'hour_bucket': 14, 'attach_rate': 30},
    'min_attach_rate': 0.25,
    'min_orders_for_suggestions': 2,
    'max_suggestions': 2,
    'hour_buckets': {
        'morning': [[10, 11]],
        'lunch': [[11, 15]],
        'evening': [[17, 21]],
        'late': [[21, 23]],
    },
    'rules_enabled': {'pairing': True, 'hour_bucket': True, 'attach_rate': True},
}


def hour_bucket(hour: int, buckets: dict | None = None) -> str:
    """Map an IST hour (0–23) to a named bucket from config."""
    buckets = buckets or DEFAULT_CONFIG['hour_buckets']
    for name, ranges in buckets.items():
        for r in ranges:
            if len(r) >= 2 and r[0] <= hour < r[1]:
                return name
    return 'other'


def _hour_filter_clause(bucket: str, buckets: dict) -> tuple[str, list]:
    """SQL predicate + params restricting orders to an IST hour bucket."""
    if bucket == 'other':
        covered: set[int] = set()
        for ranges in buckets.values():
            for r in ranges:
                for h in range(int(r[0]), int(r[1])):
                    covered.add(h)
        if not covered:
            return 'TRUE', []
        placeholders = ', '.join(['%s'] * len(covered))
        return (
            f"EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Asia/Kolkata')::int "
            f'NOT IN ({placeholders})',
            sorted(covered),
        )

    ranges = buckets.get(bucket) or []
    if not ranges:
        return 'FALSE', []

    parts: list[str] = []
    params: list[int] = []
    hour_expr = "EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Asia/Kolkata')::int"
    for r in ranges:
        parts.append(f'({hour_expr} >= %s AND {hour_expr} < %s)')
        params.extend([int(r[0]), int(r[1])])
    return f"({' OR '.join(parts)})", params


def resolve_item_name(cur, store_id: int, item_type: str, item_id: str) -> str | None:
    """Map a menu-file id to a snapshot name via menu_availability."""
    cur.execute(
        '''
        SELECT item_name
        FROM menu_availability
        WHERE store_id = %s
          AND item_type = %s::menu_item_type
          AND item_id = %s
        LIMIT 1
        ''',
        (store_id, item_type, item_id),
    )
    row = cur.fetchone()
    if row and row.get('item_name'):
        return row['item_name']
    return None


def resolve_item_id(cur, store_id: int, item_type: str, item_name: str) -> str | None:
    """Reverse lookup: snapshot name → menu-file id."""
    cur.execute(
        '''
        SELECT item_id
        FROM menu_availability
        WHERE store_id = %s
          AND item_type = %s::menu_item_type
          AND lower(item_name) = lower(%s)
        LIMIT 1
        ''',
        (store_id, item_type, item_name),
    )
    row = cur.fetchone()
    return row['item_id'] if row else None


def _count_settled_pizza_orders(
    cur, store_id: int, pizza_name: str, days: int
) -> int:
    cur.execute(
        '''
        SELECT COUNT(DISTINCT oi.id)::int AS cnt
        FROM order_item_selections pizza_sel
        JOIN order_items oi ON oi.id = pizza_sel.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s
          AND pizza_sel.role = 'pizza'
          AND lower(pizza_sel.item_name) = lower(%s)
          AND s.is_settled = true
          AND o.created_at >= now() - (%s * interval '1 day')
        ''',
        (store_id, pizza_name, days),
    )
    return cur.fetchone()['cnt'] or 0


def _top_paired_toppings(
    cur,
    store_id: int,
    pizza_name: str,
    limit: int,
    days: int,
    exclude_names: set[str],
) -> list[dict]:
    cur.execute(
        '''
        SELECT
          top_sel.item_name AS name,
          COUNT(*)::int AS pair_count
        FROM order_item_selections pizza_sel
        JOIN order_items oi ON oi.id = pizza_sel.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN order_statuses s ON s.id = o.status_id
        JOIN order_item_selections top_sel
          ON top_sel.order_item_id = pizza_sel.order_item_id
         AND top_sel.role = 'topping'
        WHERE o.store_id = %s
          AND pizza_sel.role = 'pizza'
          AND lower(pizza_sel.item_name) = lower(%s)
          AND s.is_settled = true
          AND o.created_at >= now() - (%s * interval '1 day')
        GROUP BY top_sel.item_name
        ORDER BY pair_count DESC, top_sel.item_name
        LIMIT %s
        ''',
        (store_id, pizza_name, days, max(limit * 3, limit)),
    )
    rows = cur.fetchall()
    out: list[dict] = []
    for row in rows:
        name = row['name']
        if name.lower() in {n.lower() for n in exclude_names}:
            continue
        out.append({'name': name, 'pair_count': row['pair_count']})
        if len(out) >= limit:
            break
    return out


def _count_settled_orders(cur, store_id: int, days: int) -> int:
    cur.execute(
        '''
        SELECT COUNT(*)::int AS cnt
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s
          AND s.is_settled = true
          AND o.created_at >= now() - (%s * interval '1 day')
        ''',
        (store_id, days),
    )
    return cur.fetchone()['cnt'] or 0


def _top_pizza_overall(
    cur, store_id: int, days: int, exclude_names: set[str]
) -> dict | None:
    cur.execute(
        '''
        SELECT
          pizza_sel.item_name AS name,
          SUM(oi.quantity)::int AS units
        FROM order_item_selections pizza_sel
        JOIN order_items oi ON oi.id = pizza_sel.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s
          AND pizza_sel.role = 'pizza'
          AND s.is_settled = true
          AND o.created_at >= now() - (%s * interval '1 day')
        GROUP BY pizza_sel.item_name
        ORDER BY units DESC, pizza_sel.item_name
        LIMIT %s
        ''',
        (store_id, days, max(5, len(exclude_names) + 3)),
    )
    for row in cur.fetchall():
        if row['name'].lower() not in {n.lower() for n in exclude_names}:
            return {'name': row['name'], 'units': row['units']}
    return None


def _top_pizza_in_hour_bucket(
    cur, store_id: int, bucket: str, buckets: dict, days: int
) -> dict | None:
    clause, params = _hour_filter_clause(bucket, buckets)
    cur.execute(
        f'''
        SELECT
          pizza_sel.item_name AS name,
          SUM(oi.quantity)::int AS units
        FROM order_item_selections pizza_sel
        JOIN order_items oi ON oi.id = pizza_sel.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s
          AND pizza_sel.role = 'pizza'
          AND s.is_settled = true
          AND o.created_at >= now() - (%s * interval '1 day')
          AND {clause}
        GROUP BY pizza_sel.item_name
        ORDER BY units DESC, pizza_sel.item_name
        LIMIT 1
        ''',
        [store_id, days, *params],
    )
    row = cur.fetchone()
    return {'name': row['name'], 'units': row['units']} if row else None


def _top_topping_for_pizza_in_hour_bucket(
    cur,
    store_id: int,
    pizza_name: str,
    bucket: str,
    buckets: dict,
    days: int,
    exclude_names: set[str],
) -> dict | None:
    clause, params = _hour_filter_clause(bucket, buckets)
    cur.execute(
        f'''
        SELECT
          top_sel.item_name AS name,
          COUNT(*)::int AS pair_count
        FROM order_item_selections pizza_sel
        JOIN order_items oi ON oi.id = pizza_sel.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN order_statuses s ON s.id = o.status_id
        JOIN order_item_selections top_sel
          ON top_sel.order_item_id = pizza_sel.order_item_id
         AND top_sel.role = 'topping'
        WHERE o.store_id = %s
          AND pizza_sel.role = 'pizza'
          AND lower(pizza_sel.item_name) = lower(%s)
          AND s.is_settled = true
          AND o.created_at >= now() - (%s * interval '1 day')
          AND {clause}
        GROUP BY top_sel.item_name
        ORDER BY pair_count DESC, top_sel.item_name
        LIMIT %s
        ''',
        [store_id, pizza_name, days, *params, max(5, len(exclude_names) + 3)],
    )
    for row in cur.fetchall():
        if row['name'].lower() not in {n.lower() for n in exclude_names}:
            return {'name': row['name'], 'pair_count': row['pair_count']}
    return None


def _high_attach_toppings(
    cur,
    store_id: int,
    pizza_name: str,
    min_rate: float,
    days: int,
    exclude_names: set[str],
) -> list[dict]:
    cur.execute(
        '''
        WITH pizza_orders AS (
          SELECT COUNT(DISTINCT oi.id)::float AS cnt
          FROM order_item_selections pizza_sel
          JOIN order_items oi ON oi.id = pizza_sel.order_item_id
          JOIN orders o ON o.id = oi.order_id
          JOIN order_statuses s ON s.id = o.status_id
          WHERE o.store_id = %s
            AND pizza_sel.role = 'pizza'
            AND lower(pizza_sel.item_name) = lower(%s)
            AND s.is_settled = true
            AND o.created_at >= now() - (%s * interval '1 day')
        ),
        topping_pairs AS (
          SELECT
            top_sel.item_name AS name,
            COUNT(DISTINCT oi.id)::float AS pairs
          FROM order_item_selections pizza_sel
          JOIN order_items oi ON oi.id = pizza_sel.order_item_id
          JOIN orders o ON o.id = oi.order_id
          JOIN order_statuses s ON s.id = o.status_id
          JOIN order_item_selections top_sel
            ON top_sel.order_item_id = pizza_sel.order_item_id
           AND top_sel.role = 'topping'
          WHERE o.store_id = %s
            AND pizza_sel.role = 'pizza'
            AND lower(pizza_sel.item_name) = lower(%s)
            AND s.is_settled = true
            AND o.created_at >= now() - (%s * interval '1 day')
          GROUP BY top_sel.item_name
        )
        SELECT
          tp.name,
          tp.pairs,
          (tp.pairs / NULLIF(po.cnt, 0)) AS attach_rate
        FROM topping_pairs tp
        CROSS JOIN pizza_orders po
        WHERE po.cnt > 0
          AND (tp.pairs / po.cnt) >= %s
        ORDER BY attach_rate DESC, tp.name
        ''',
        (store_id, pizza_name, days, store_id, pizza_name, days, min_rate),
    )
    out: list[dict] = []
    for row in cur.fetchall():
        if row['name'].lower() in {n.lower() for n in exclude_names}:
            continue
        out.append(
            {
                'name': row['name'],
                'attach_rate': float(row['attach_rate'] or 0),
                'pairs': int(row['pairs'] or 0),
            }
        )
    return out


def _make_add_pizza(
    cur, store_id: int, rule: str, pizza_name: str, bucket_label: str = ''
) -> dict:
    item_id = resolve_item_id(cur, store_id, 'pizza', pizza_name)
    when = f' this {bucket_label}' if bucket_label else ''
    return {
        'rule': rule,
        'message': f'Popular{when}: {pizza_name}.',
        'action': {
            'type': 'add_pizza',
            'item_id': item_id,
            'item_name': pizza_name,
        },
    }


def _make_add_topping(
    cur, store_id: int, rule: str, pizza_name: str, topping_name: str
) -> dict:
    item_id = resolve_item_id(cur, store_id, 'topping', topping_name)
    return {
        'rule': rule,
        'message': (
            f'Customers often add {topping_name} with {pizza_name}.'
        ),
        'action': {
            'type': 'add_topping',
            'item_id': item_id,
            'item_name': topping_name,
        },
    }


def build_suggestions(
    pizza_id: str,
    selected_topping_ids: list[str] | None = None,
    cart_qty: int = 0,
    pizza_name: str | None = None,
    config: dict | None = None,
    now: datetime | None = None,
) -> dict:
    """Assemble ranked R1–R3 suggestions (max 2). R4 is frontend-only."""
    cfg = {
        **DEFAULT_CONFIG,
        **(config or {}),
        'lookback_days': {
            **DEFAULT_CONFIG['lookback_days'],
            **((config or {}).get('lookback_days') or {}),
        },
        'rules_enabled': {
            **DEFAULT_CONFIG['rules_enabled'],
            **((config or {}).get('rules_enabled') or {}),
        },
        'hour_buckets': {
            **DEFAULT_CONFIG['hour_buckets'],
            **((config or {}).get('hour_buckets') or {}),
        },
    }
    selected_topping_ids = selected_topping_ids or []
    max_n = int(cfg.get('max_suggestions', 2))
    rules = cfg.get('rules_enabled') or {}
    lookback = cfg.get('lookback_days') or {}
    buckets = cfg.get('hour_buckets') or DEFAULT_CONFIG['hour_buckets']
    min_orders = int(cfg.get('min_orders_for_suggestions', 5))
    min_rate = float(cfg.get('min_attach_rate', 0.25))

    now = now or datetime.now(tz=IST)
    bucket = hour_bucket(now.hour, buckets)
    bucket_label = bucket.replace('_', ' ')

    suggestions: list[dict] = []
    used_topping_names: set[str] = set()
    used_pizza_names: set[str] = set()

    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)

        resolved_pizza = pizza_name or resolve_item_name(cur, store_id, 'pizza', pizza_id)
        if not resolved_pizza:
            return {'suggestions': []}

        exclude_names: set[str] = set()
        for tid in selected_topping_ids:
            tname = resolve_item_name(cur, store_id, 'topping', tid)
            if tname:
                exclude_names.add(tname)

        pairing_days = int(lookback.get('pairing', 30))
        order_count = _count_settled_pizza_orders(
            cur, store_id, resolved_pizza, pairing_days
        )
        if order_count < min_orders:
            return {'suggestions': []}

        def add_suggestion(entry: dict | None) -> bool:
            if not entry or len(suggestions) >= max_n:
                return False
            action = entry.get('action') or {}
            tname = action.get('item_name')
            if action.get('type') == 'add_topping' and tname:
                key = tname.lower()
                if key in used_topping_names or key in {n.lower() for n in exclude_names}:
                    return False
                used_topping_names.add(key)
            if action.get('type') == 'add_pizza' and tname:
                key = tname.lower()
                if key in used_pizza_names or key == resolved_pizza.lower():
                    return False
                used_pizza_names.add(key)
            suggestions.append(entry)
            return True

        if rules.get('pairing', True):
            pairs = _top_paired_toppings(
                cur,
                store_id,
                resolved_pizza,
                max_n,
                pairing_days,
                exclude_names | used_topping_names,
            )
            for row in pairs:
                if len(suggestions) >= max_n:
                    break
                add_suggestion(
                    _make_add_topping(
                        cur, store_id, 'pairing', resolved_pizza, row['name']
                    )
                )

        if rules.get('hour_bucket', True) and len(suggestions) < max_n:
            hour_days = int(lookback.get('hour_bucket', 14))
            hot_pizza = _top_pizza_in_hour_bucket(
                cur, store_id, bucket, buckets, hour_days
            )
            if hot_pizza and hot_pizza['name'].lower() != resolved_pizza.lower():
                add_suggestion(
                    _make_add_pizza(
                        cur,
                        store_id,
                        'hour_bucket',
                        hot_pizza['name'],
                        bucket_label,
                    )
                )
            else:
                top_in_bucket = _top_topping_for_pizza_in_hour_bucket(
                    cur,
                    store_id,
                    resolved_pizza,
                    bucket,
                    buckets,
                    hour_days,
                    exclude_names | used_topping_names,
                )
                if top_in_bucket:
                    add_suggestion(
                        _make_add_topping(
                            cur,
                            store_id,
                            'hour_bucket',
                            resolved_pizza,
                            top_in_bucket['name'],
                        )
                    )

        if rules.get('attach_rate', True) and len(suggestions) < max_n:
            attach_days = int(lookback.get('attach_rate', 30))
            attached = _high_attach_toppings(
                cur,
                store_id,
                resolved_pizza,
                min_rate,
                attach_days,
                exclude_names | used_topping_names,
            )
            for row in attached:
                if len(suggestions) >= max_n:
                    break
                add_suggestion(
                    _make_add_topping(
                        cur, store_id, 'attach_rate', resolved_pizza, row['name']
                    )
                )

    return {'suggestions': suggestions[:max_n]}


def build_menu_suggestions(
    cart_qty: int = 0,
    exclude_pizza_ids: list[str] | None = None,
    config: dict | None = None,
    now: datetime | None = None,
) -> dict:
    """Popular pizzas for the order menu (hour bucket + overall top seller)."""
    cfg = {
        **DEFAULT_CONFIG,
        **(config or {}),
        'lookback_days': {
            **DEFAULT_CONFIG['lookback_days'],
            **((config or {}).get('lookback_days') or {}),
        },
        'rules_enabled': {
            **DEFAULT_CONFIG['rules_enabled'],
            **((config or {}).get('rules_enabled') or {}),
        },
        'hour_buckets': {
            **DEFAULT_CONFIG['hour_buckets'],
            **((config or {}).get('hour_buckets') or {}),
        },
    }
    exclude_pizza_ids = exclude_pizza_ids or []
    exclude_ids = {pid.strip() for pid in exclude_pizza_ids if pid and pid.strip()}
    max_n = int(cfg.get('max_suggestions', 2))
    rules = cfg.get('rules_enabled') or {}
    lookback = cfg.get('lookback_days') or {}
    buckets = cfg.get('hour_buckets') or DEFAULT_CONFIG['hour_buckets']
    min_orders = int(cfg.get('min_orders_for_suggestions', 2))

    now = now or datetime.now(tz=IST)
    bucket = hour_bucket(now.hour, buckets)
    bucket_label = bucket.replace('_', ' ')

    suggestions: list[dict] = []
    used_pizza_names: set[str] = set()

    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)

        exclude_names: set[str] = set()
        for pid in exclude_ids:
            pname = resolve_item_name(cur, store_id, 'pizza', pid)
            if pname:
                exclude_names.add(pname)

        pairing_days = int(lookback.get('pairing', 30))
        if _count_settled_orders(cur, store_id, pairing_days) < min_orders:
            return {'suggestions': []}

        def add_pizza_suggestion(entry: dict | None) -> bool:
            if not entry or len(suggestions) >= max_n:
                return False
            action = entry.get('action') or {}
            pname = action.get('item_name')
            pid = action.get('item_id')
            if action.get('type') != 'add_pizza' or not pname:
                return False
            if pid and pid in exclude_ids:
                return False
            key = pname.lower()
            if key in used_pizza_names or key in {n.lower() for n in exclude_names}:
                return False
            used_pizza_names.add(key)
            suggestions.append(entry)
            return True

        if rules.get('hour_bucket', True):
            hour_days = int(lookback.get('hour_bucket', 14))
            hot_pizza = _top_pizza_in_hour_bucket(
                cur, store_id, bucket, buckets, hour_days
            )
            if hot_pizza:
                add_pizza_suggestion(
                    _make_add_pizza(
                        cur,
                        store_id,
                        'hour_bucket',
                        hot_pizza['name'],
                        bucket_label,
                    )
                )

        if len(suggestions) < max_n:
            overall_days = int(lookback.get('pairing', 30))
            top_overall = _top_pizza_overall(
                cur, store_id, overall_days, exclude_names | used_pizza_names
            )
            if top_overall:
                add_pizza_suggestion(
                    _make_add_pizza(cur, store_id, 'top_seller', top_overall['name'])
                )

    return {'suggestions': suggestions[:max_n]}
