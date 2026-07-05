#!/usr/bin/env python3
"""
Seed demo orders, staff, and kitchen flow for analytics + Suggestion Bhayya.

Usage:
  python scripts/seed_demo_data.py [--reset] [--orders 80] [--days 14] [--active 8]

Requires: DATABASE_URL in backend/.env, sql/schema.sql applied.

npm shortcuts:
  npm run seed:demo -- --reset --orders 80 --days 14
  npm run seed:demo:reset
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

from db import db_cursor  # noqa: E402
from kitchen import transition_kitchen_item  # noqa: E402
from models import CreateOrderRequest, PizzaItem  # noqa: E402
from queries import cancel_order, complete_order, create_order, ensure_store  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
MENU_DIR = ROOT / 'public' / 'data'
DEMO_PHONE_PREFIX = '9999'

# Preferred pairings for Suggestion Bhayya (names must match menu files).
PAIRING_BOOST: dict[str, list[str]] = {
    'Margherita': ['Extra Cheese', 'Sweet Corn'],
    'Pepperoni Classic': ['Jalapenos', 'Extra Cheese'],
    'Farm House': ['Button Mushrooms', 'Green Peppers'],
    'Paneer Tikka': ['Peri-Peri Drizzle', 'Green Peppers'],
    'BBQ Chicken': ['Caramelised Onions', 'Sweet Corn'],
}

DEMO_STAFF = [
    ('Raj Kumar', 'staff', '0000'),
    ('Priya Singh', 'staff', '0000'),
    ('Amit Sharma', 'manager', '0000'),
    ('Neha Verma', 'staff', '0000'),
    ('Rajan Sharma', 'admin', '0000'),
]

PAYMENT_WEIGHTS = [('cash', 35), ('upi', 45), ('card', 20)]
HOUR_WEIGHTS = (
    [(11, 14), 35],
    [(17, 21), 40],
    [(21, 23), 10],
    [(12, 13), 15],
)


def round2(value: Decimal) -> Decimal:
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def parse_menu_file(path: Path) -> list[dict]:
    items = []
    if not path.exists():
        return items
    for line in path.read_text(encoding='utf-8').splitlines():
        parts = [p.strip() for p in line.split(';')]
        if len(parts) != 3:
            continue
        try:
            price = float(parts[2])
        except ValueError:
            continue
        if price <= 0:
            continue
        items.append({'id': parts[0], 'name': parts[1], 'price': price})
    return items


def load_menu():
    bases = parse_menu_file(MENU_DIR / 'Types_of_Base.txt')
    pizzas = parse_menu_file(MENU_DIR / 'Types_of_Pizza.txt')
    toppings = parse_menu_file(MENU_DIR / 'Types_of_Toppings.txt')
    if not bases or not pizzas:
        raise RuntimeError('Menu files missing or empty in public/data/')
    return bases, pizzas, toppings


def toppings_by_name(toppings: list[dict]) -> dict[str, dict]:
    return {t['name']: t for t in toppings}


def pick_toppings(
    rng: random.Random,
    pizza: dict,
    toppings: list[dict],
    topping_map: dict[str, dict],
) -> list[dict]:
    preferred = PAIRING_BOOST.get(pizza['name'], [])
    if preferred and rng.random() < 0.65:
        picked = [topping_map[n] for n in preferred if n in topping_map]
        if picked:
            return picked[: rng.randint(1, min(2, len(picked)))]
    count = rng.randint(0, min(2, len(toppings)))
    return rng.sample(toppings, k=count) if count else []


def build_line(
    pizza: dict,
    base: dict,
    tops: list[dict],
    qty: int,
    bulk_discount: bool,
) -> PizzaItem:
    unit = Decimal(str(base['price'])) + Decimal(str(pizza['price']))
    for t in tops:
        unit += Decimal(str(t['price']))
    subtotal = unit * qty
    discount = round2(subtotal * Decimal('0.1')) if bulk_discount else Decimal('0')
    taxable = subtotal - discount
    gst = round2(taxable * Decimal('0.18'))
    return PizzaItem(
        pizza_type=pizza['name'],
        base=base['name'],
        toppings=[t['name'] for t in tops],
        price_wo_gst=taxable / qty,
        line_discount=discount,
        gst=gst,
        quantity=qty,
    )


def build_order_items(
    rng: random.Random,
    bases: list[dict],
    pizzas: list[dict],
    toppings: list[dict],
) -> list[PizzaItem]:
    topping_map = toppings_by_name(toppings)
    num_lines = rng.choices([1, 1, 2, 3], weights=[45, 25, 20, 10])[0]
    lines: list[tuple[dict, dict, list[dict], int]] = []
    total_qty = 0
    for _ in range(num_lines):
        pizza = rng.choice(pizzas)
        base = rng.choice(bases)
        tops = pick_toppings(rng, pizza, toppings, topping_map)
        qty = rng.choices([1, 1, 2, 3, 5], weights=[35, 25, 20, 15, 5])[0]
        lines.append((pizza, base, tops, qty))
        total_qty += qty
    bulk = total_qty >= 5
    return [build_line(p, b, t, q, bulk) for p, b, t, q in lines]


def ensure_demo_staff(cur, store_id: int) -> list[int]:
    staff_ids: list[int] = []
    for name, role, pin in DEMO_STAFF:
        cur.execute(
            'SELECT id FROM staff WHERE store_id = %s AND full_name = %s',
            (store_id, name),
        )
        row = cur.fetchone()
        if row:
            staff_ids.append(row['id'])
        else:
            cur.execute(
                '''
                INSERT INTO staff (store_id, full_name, role, pin, is_active)
                VALUES (%s, %s, %s, %s, true)
                RETURNING id
                ''',
                (store_id, name, role, pin),
            )
            staff_ids.append(cur.fetchone()['id'])
    return staff_ids


def reset_demo_data(cur, store_id: int) -> None:
    cur.execute(
        '''
        SELECT id, session_id FROM orders
        WHERE store_id = %s AND customer_phone LIKE %s
        ''',
        (store_id, f'{DEMO_PHONE_PREFIX}%'),
    )
    rows = cur.fetchall()
    session_ids = list({r['session_id'] for r in rows if r['session_id']})

    cur.execute(
        "DELETE FROM orders WHERE store_id = %s AND customer_phone LIKE %s",
        (store_id, f'{DEMO_PHONE_PREFIX}%'),
    )

    if session_ids:
        cur.execute(
            'UPDATE store_tables SET current_session_id = NULL '
            'WHERE current_session_id = ANY(%s)',
            (session_ids,),
        )
        cur.execute('DELETE FROM table_sessions WHERE id = ANY(%s)', (session_ids,))


def pick_order_hour(rng: random.Random) -> int:
    buckets, weights = zip(*HOUR_WEIGHTS)
    low, high = rng.choices(buckets, weights=weights)[0]
    return rng.randint(low, high - 1 if high > low else low)


def make_created_at(rng: random.Random, now: datetime, days_span: int) -> datetime:
    days_ago = rng.randint(0, max(0, days_span - 1))
    hour = pick_order_hour(rng)
    ist_day = (now.astimezone(IST) - timedelta(days=days_ago)).replace(
        hour=hour, minute=rng.randint(0, 59), second=rng.randint(0, 59), microsecond=0
    )
    return ist_day.astimezone(timezone.utc)


def backdate_order(cur, order_public_id: str, created_at: datetime, store_id: int) -> int:
    cur.execute('SELECT id FROM orders WHERE public_id = %s', (order_public_id,))
    row = cur.fetchone()
    if not row:
        return 0
    oid = row['id']
    biz_date = created_at.astimezone(IST).date()
    cur.execute(
        '''
        SELECT COALESCE(MAX(order_sequence), 0) + 1 AS next_seq
        FROM orders
        WHERE store_id = %s AND business_date = %s
        ''',
        (store_id, biz_date),
    )
    next_seq = cur.fetchone()['next_seq']
    order_code = f'SM-{str(next_seq).zfill(4)}'
    cur.execute(
        '''
        UPDATE orders SET
          created_at = %s,
          placed_at = %s,
          business_date = %s,
          order_sequence = %s,
          order_code = %s
        WHERE id = %s
        ''',
        (created_at, created_at, biz_date, next_seq, order_code, oid),
    )
    cur.execute(
        'UPDATE order_items SET queued_at = %s WHERE order_id = %s',
        (created_at, oid),
    )
    return oid


def advance_item_timestamps(
    cur, item_id: int, base: datetime, prep_minutes: float
) -> None:
    assigned = base + timedelta(minutes=1)
    preparing = base + timedelta(minutes=2)
    ready = base + timedelta(minutes=prep_minutes)
    served = ready + timedelta(minutes=3)
    cur.execute(
        '''
        UPDATE order_items SET
          assigned_at = %s,
          preparing_at = %s,
          ready_at = %s,
          served_at = %s
        WHERE id = %s
        ''',
        (assigned, preparing, ready, served, item_id),
    )


def backdate_terminal_timestamps(
    cur,
    order_id: int,
    created_at: datetime,
    prep_minutes: float,
    *,
    cancelled: bool,
) -> None:
    dwell = prep_minutes + random.uniform(15, 45)
    terminal_at = created_at + timedelta(minutes=dwell)
    if cancelled:
        cur.execute(
            'UPDATE orders SET cancelled_at = %s WHERE id = %s',
            (terminal_at, order_id),
        )
    else:
        cur.execute(
            'UPDATE orders SET completed_at = %s WHERE id = %s',
            (terminal_at, order_id),
        )
        cur.execute(
            'UPDATE payments SET paid_at = %s WHERE order_id = %s',
            (created_at + timedelta(minutes=2), order_id),
        )

    cur.execute('SELECT session_id FROM orders WHERE id = %s', (order_id,))
    sess = cur.fetchone()
    if not sess or not sess['session_id']:
        return
    session_id = sess['session_id']
    seated_at = created_at - timedelta(minutes=random.uniform(3, 12))
    closed_at = terminal_at + timedelta(minutes=random.uniform(5, 20))
    cur.execute(
        '''
        UPDATE table_sessions SET
          seated_at = %s,
          closed_at = %s,
          status = 'closed'
        WHERE id = %s
        ''',
        (seated_at, closed_at, session_id),
    )


def get_item_ids(cur, order_id: int) -> list[int]:
    cur.execute(
        'SELECT id FROM order_items WHERE order_id = %s ORDER BY line_no',
        (order_id,),
    )
    return [r['id'] for r in cur.fetchall()]


def run_kitchen_flow(
    cur,
    item_ids: list[int],
    staff_id: int,
    prep_minutes: float,
    base: datetime,
    *,
    full: bool = True,
) -> None:
    for item_id in item_ids:
        transition_kitchen_item(item_id, 'assigned', staff_id)
        transition_kitchen_item(item_id, 'preparing', staff_id)
        if full:
            transition_kitchen_item(item_id, 'ready', staff_id)
            transition_kitchen_item(item_id, 'served', staff_id)
            advance_item_timestamps(cur, item_id, base, prep_minutes)
        else:
            advance_item_timestamps(cur, item_id, base, prep_minutes * 0.5)


def refresh_reporting(cur) -> None:
    cur.execute(
        '''
        SELECT 1 FROM pg_proc WHERE proname = 'refresh_reporting' LIMIT 1
        '''
    )
    if cur.fetchone():
        cur.execute('SELECT refresh_reporting()')


def print_summary(store_id: int, days: int) -> None:
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT
              count(*) FILTER (WHERE s.is_settled)::int AS settled,
              count(*) FILTER (WHERE s.is_cancelled)::int AS cancelled,
              count(*) FILTER (WHERE s.is_open)::int AS active,
              count(*)::int AS total
            FROM orders o
            JOIN order_statuses s ON s.id = o.status_id
            WHERE o.store_id = %s AND o.customer_phone LIKE %s
            ''',
            (store_id, f'{DEMO_PHONE_PREFIX}%'),
        )
        counts = cur.fetchone()

        cur.execute(
            '''
            SELECT count(*)::int AS cnt
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.store_id = %s AND o.customer_phone LIKE %s
              AND oi.ready_at IS NOT NULL AND oi.queued_at IS NOT NULL
            ''',
            (store_id, f'{DEMO_PHONE_PREFIX}%'),
        )
        prep_rows = cur.fetchone()['cnt']

        cur.execute(
            '''
            SELECT p.method::text, count(*)::int AS cnt
            FROM payments p
            JOIN orders o ON o.id = p.order_id
            JOIN order_statuses s ON s.id = o.status_id
            WHERE o.store_id = %s AND o.customer_phone LIKE %s
              AND s.is_cancelled = false
              AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
                    - ((%s - 1) * interval '1 day')
            GROUP BY p.method
            ORDER BY cnt DESC
            ''',
            (store_id, f'{DEMO_PHONE_PREFIX}%', days),
        )
        payments = cur.fetchall()

        cur.execute(
            'SELECT count(*)::int AS cnt FROM staff WHERE store_id = %s AND is_active',
            (store_id,),
        )
        staff_count = cur.fetchone()['cnt']

    print('\n--- Seed summary ---')
    print(f'Staff active: {staff_count}')
    print(
        f'Demo orders — total: {counts["total"]}, '
        f'settled: {counts["settled"]}, cancelled: {counts["cancelled"]}, '
        f'active: {counts["active"]}'
    )
    print(f'Items with prep timestamps: {prep_rows}')
    if payments:
        mix = ', '.join(f'{r["method"]}: {r["cnt"]}' for r in payments)
        print(f'Payment mix (last {days}d): {mix}')


def verify_analytics(days: int) -> None:
    try:
        from analytics_summary import analytics_summary

        summary = analytics_summary(days=days)
        sales = summary['categories']['sales']
        prep = summary['categories']['order_times']
        cancel = summary['categories']['cancellations']
        print('\n--- Analytics snapshot ---')
        print(f'Net sales ({days}d): {sales["primary"]["value"]}')
        print(f'Orders: {sales["secondary"]["orders"]}')
        print(f'Avg prep (min): {prep["primary"]["value"]}')
        print(f'Cancel rate (%): {cancel["primary"]["value"]}')
        print(f'Payment methods: {len(sales["details"]["payment_mix"])}')
        print(f'Daily sales rows: {len(sales["details"]["sales_daily"])}')
    except Exception as exc:
        print(f'\nAnalytics verify skipped: {exc}')


def main():
    parser = argparse.ArgumentParser(description='Seed SliceMatic demo data')
    parser.add_argument('--reset', action='store_true', help='Delete prior demo orders first')
    parser.add_argument('--orders', type=int, default=80, help='Number of orders to create')
    parser.add_argument('--days', type=int, default=14, help='Calendar span for backdated orders')
    parser.add_argument(
        '--active',
        type=int,
        default=8,
        help='Target count of still-open demo orders (kitchen backlog)',
    )
    parser.add_argument(
        '--verify-analytics',
        action='store_true',
        help='Print analytics summary after seeding',
    )
    args = parser.parse_args()

    bases, pizzas, toppings = load_menu()
    rng = random.Random(42)
    payment_choices, payment_weights = zip(*PAYMENT_WEIGHTS)

    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        if args.reset:
            reset_demo_data(cur, store_id)
            print('Reset demo orders and table sessions.')
        staff_ids = ensure_demo_staff(cur, store_id)
        cur.execute(
            "UPDATE staff SET pin = '0000' WHERE store_id = %s",
            (store_id,),
        )
        refresh_reporting(cur)

    if not staff_ids:
        print('Warning: no staff found — kitchen flow and completions will be limited.')

    now = datetime.now(timezone.utc)
    created = 0
    active_target = min(args.active, max(1, args.orders // 10))

    for i in range(args.orders):
        created_at = make_created_at(rng, now, args.days)
        items = build_order_items(rng, bases, pizzas, toppings)
        table_num = rng.randint(1, 12)
        phone = f'{DEMO_PHONE_PREFIX}{str(i).zfill(6)}'
        staff_id = rng.choice(staff_ids) if staff_ids else None

        payload = CreateOrderRequest(
            name='Demo Customer',
            phone=phone,
            items=items,
            payment_type=rng.choices(payment_choices, weights=payment_weights)[0],
            table=f'Table {table_num}',
        )

        try:
            result = create_order(payload)
        except Exception as exc:
            print(f'Skip order {i}: {exc}')
            continue

        order_id = result['order_id']
        # Last N orders stay active for kitchen backlog / admin views.
        keep_active = created >= args.orders - active_target
        should_cancel = (not keep_active) and rng.random() < 0.08

        with db_cursor() as (_, cur):
            oid = backdate_order(cur, order_id, created_at, store_id)
            item_ids = get_item_ids(cur, oid)

        prep_min = 8 + rng.random() * 14
        slow_pizzas = {p['name'] for p in pizzas if p['name'] in ('Paneer Tikka', 'Farm House')}
        if items[0].pizza_type in slow_pizzas and rng.random() < 0.35:
            prep_min += 5

        will_complete = (
            not should_cancel and not keep_active and staff_id and item_ids
        )

        if will_complete:
            with db_cursor() as (_, cur):
                run_kitchen_flow(
                    cur, item_ids, staff_id, prep_min, created_at, full=True
                )
        elif staff_id and item_ids and keep_active:
            with db_cursor() as (_, cur):
                stage = rng.choice(['queued', 'assigned', 'preparing', 'ready'])
                if stage in ('assigned', 'preparing', 'ready'):
                    transition_kitchen_item(item_ids[0], 'assigned', staff_id)
                if stage in ('preparing', 'ready'):
                    transition_kitchen_item(item_ids[0], 'preparing', staff_id)
                if stage == 'ready':
                    transition_kitchen_item(item_ids[0], 'ready', staff_id)
        elif staff_id and item_ids and should_cancel and rng.random() < 0.55:
            with db_cursor() as (_, cur):
                run_kitchen_flow(
                    cur, item_ids, staff_id, prep_min, created_at, full=False
                )

        if should_cancel:
            cancel_order(order_id, reason='Demo cancel')
            with db_cursor() as (_, cur):
                backdate_terminal_timestamps(
                    cur, oid, created_at, prep_min, cancelled=True
                )
        elif will_complete:
            complete_order(order_id)
            with db_cursor() as (_, cur):
                backdate_terminal_timestamps(
                    cur, oid, created_at, prep_min, cancelled=False
                )

        created += 1
        if created % 20 == 0:
            print(f'Created {created} orders…')

    with db_cursor() as (_, cur):
        refresh_reporting(cur)

    print(f'Done — seeded {created} demo orders over {args.days} days.')
    print_summary(store_id, args.days)

    if args.verify_analytics:
        verify_analytics(args.days)


if __name__ == '__main__':
    main()
