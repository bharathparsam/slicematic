import os
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from queries import list_orders, orders_per_hour, payment_mix, sales_daily, top_products

TZ = ZoneInfo('Asia/Kolkata')


def _num(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _order_summary(orders: list[dict]) -> dict:
    """Aggregate counts only — no customer PII in the chat context."""
    today = datetime.now(TZ).date()
    active = completed = cancelled = 0
    today_orders = 0
    today_net = 0.0

    for o in orders:
        code = (o.get('status') or 'active').lower()
        if code == 'cancelled':
            cancelled += 1
        elif code == 'completed':
            completed += 1
        else:
            active += 1

        created = o.get('created_at')
        if created and code != 'cancelled':
            try:
                dt = datetime.fromisoformat(str(created).replace('Z', '+00:00'))
                if dt.astimezone(TZ).date() == today:
                    today_orders += 1
                    today_net += _num(o.get('grand_total'))
            except (TypeError, ValueError):
                pass

    return {
        'total_orders': len(orders),
        'active_orders': active,
        'completed_orders': completed,
        'cancelled_orders': cancelled,
        'today_orders': today_orders,
        'today_net_sales_inr': round(today_net, 2),
    }


def _peak_hours(points: list[dict], top_n: int = 5) -> list[dict]:
    ranked = sorted(points, key=lambda p: p.get('orders_count') or 0, reverse=True)
    peaks = []
    for p in ranked[:top_n]:
        count = p.get('orders_count') or 0
        if count <= 0:
            continue
        hour_label = str(p.get('order_hour', ''))[:16]
        peaks.append({'order_hour': hour_label, 'orders_count': count})
    return peaks


def build_analytics_context(days: int | None = None) -> dict:
    """Fresh analytics facts for the COO chatbot — aggregates only."""
    window = days
    if window is None:
        window = int(os.getenv('CHAT_CONTEXT_DAYS', '7'))

    daily = sales_daily(window)
    products = top_products(10)
    payments = payment_mix(window)
    hourly = orders_per_hour()
    orders = list_orders()

    days_list = daily.get('days') or []
    net_7 = sum(_num(d.get('net_sales')) for d in days_list)
    orders_7 = sum(int(d.get('orders_count') or 0) for d in days_list)
    avg_ticket = round(net_7 / orders_7, 2) if orders_7 else 0.0

    best_day = None
    if days_list:
        best = max(days_list, key=lambda d: _num(d.get('net_sales')))
        best_day = {
            'business_date': best.get('business_date'),
            'net_sales_inr': round(_num(best.get('net_sales')), 2),
            'orders_count': int(best.get('orders_count') or 0),
        }

    return {
        'store': os.getenv('STORE_NAME', 'SliceMatic Delhi'),
        'timezone': 'Asia/Kolkata',
        'as_of': datetime.now(TZ).isoformat(),
        'window_days': window,
        'kpis': {
            'net_sales_inr': round(net_7, 2),
            'orders_count': orders_7,
            'avg_ticket_inr': avg_ticket,
            'best_day': best_day,
        },
        'daily_sales': [
            {
                'business_date': d.get('business_date'),
                'orders_count': int(d.get('orders_count') or 0),
                'gross_sales_inr': round(_num(d.get('gross_sales')), 2),
                'discounts_inr': round(_num(d.get('discounts')), 2),
                'net_sales_inr': round(_num(d.get('net_sales')), 2),
            }
            for d in days_list
        ],
        'top_pizzas': [
            {
                'name': p.get('name'),
                'units_sold': int(p.get('units_sold') or 0),
                'revenue_inr': round(_num(p.get('revenue')), 2),
            }
            for p in (products.get('products') or [])
        ],
        'payment_mix': [
            {
                'method': m.get('method'),
                'payments_count': int(m.get('payments_count') or 0),
                'amount_inr': round(_num(m.get('amount')), 2),
            }
            for m in (payments.get('methods') or [])
        ],
        'peak_hours_last_7d': _peak_hours(hourly.get('points') or []),
        'order_summary': _order_summary(orders),
    }
