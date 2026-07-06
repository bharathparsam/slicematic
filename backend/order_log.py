"""orders_log.txt — human-readable, parseable append log of every placed order.

The database is the source of truth; this file is the flat-text order log required
by the SliceMatic brief. One order per block, a blank line between orders.

Live path: append_order(order) is called after each successful create_order.
Backfill : rebuild_from_db() rewrites the whole file from the DB (oldest first).
"""

import os
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

IST = ZoneInfo('Asia/Kolkata')

# Default: <repo-root>/orders_log.txt (backend/ is one level down). Override with
# ORDER_LOG_PATH (e.g. on a host with a writable data dir).
_DEFAULT_PATH = Path(__file__).resolve().parents[1] / 'orders_log.txt'
LOG_PATH = Path(os.getenv('ORDER_LOG_PATH', str(_DEFAULT_PATH)))

HEADER = (
    '# SliceMatic — orders_log.txt\n'
    '# One order per block. Fields are "Key : Value"; blocks are separated by a blank line.\n'
    '# The database remains the source of truth; this is the flat-text order log.\n\n'
)


def _money(value) -> str:
    return '₹' + f'{Decimal(str(value or 0)):.2f}'


def _fmt_ts(iso) -> str:
    try:
        dt = datetime.fromisoformat(str(iso).replace('Z', '+00:00'))
        return dt.astimezone(IST).strftime('%Y-%m-%d %H:%M:%S IST')
    except (TypeError, ValueError):
        return str(iso)


def format_order_block(o: dict) -> str:
    """Format one order (list_orders() shape) into a parseable text block."""
    lines = [
        f"Order Code   : {o.get('order_code') or '-'}",
        f"Timestamp    : {_fmt_ts(o.get('created_at'))}",
        f"Status       : {o.get('status') or '-'}",
        f"Customer     : {o.get('name') or '-'}",
        f"Phone        : {o.get('phone') or '-'}",
        f"Table        : {o.get('table') or '-'}",
        f"Payment Mode : {(o.get('payment_type') or '-').upper()}",
        'Items:',
    ]
    total_qty = 0
    for it in o.get('items', []):
        qty = int(it.get('quantity') or 0)
        total_qty += qty
        line_sub = Decimal(str(it.get('line_subtotal') or 0))
        unit = (line_sub / qty) if qty else Decimal('0')
        toppings = ', '.join(it.get('toppings') or []) or 'none'
        lines.append(
            f"  - {it.get('pizza_type') or '-'} | Base: {it.get('base') or '-'} "
            f"| Toppings: {toppings} | Qty: {qty} "
            f"| Unit: {_money(unit)} | Line: {_money(it.get('line_subtotal'))}"
        )
    lines += [
        f"Total Pizzas : {total_qty}",
        f"Subtotal     : {_money(o.get('subtotal'))}",
        f"Discount     : {_money(o.get('discount'))}",
        f"GST (18%)    : {_money(o.get('gst'))}",
        f"Final Total  : {_money(o.get('grand_total'))}",
    ]
    return '\n'.join(lines)


def append_order(order: dict) -> None:
    """Append one order block. Best-effort: never raises (the DB already has it)."""
    try:
        if not LOG_PATH.exists():
            LOG_PATH.write_text(HEADER, encoding='utf-8')
        with open(LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(format_order_block(order) + '\n\n')
    except OSError:
        pass


def rebuild_from_db() -> int:
    """Rewrite orders_log.txt from every order in the DB (oldest first)."""
    from queries import list_orders

    orders = sorted(list_orders(), key=lambda o: o.get('created_at') or '')
    body = '\n\n'.join(format_order_block(o) for o in orders)
    LOG_PATH.write_text(HEADER + (body + '\n\n' if body else ''), encoding='utf-8')
    return len(orders)
