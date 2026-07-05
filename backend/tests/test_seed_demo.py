"""Unit tests for demo seed helpers (no DB required)."""

from decimal import Decimal
from pathlib import Path
import random
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import seed_demo_data as seed  # noqa: E402


def _load_menu():
    return seed.load_menu()


def test_build_order_items_bulk_discount_when_total_qty_at_least_five():
    bases, pizzas, toppings = _load_menu()
    rng = random.Random(99)
    found_bulk = False
    for _ in range(40):
        items = seed.build_order_items(rng, bases, pizzas, toppings)
        total_qty = sum(i.quantity for i in items)
        if total_qty >= 5:
            found_bulk = True
            assert all(i.line_discount > 0 for i in items), 'bulk lines should carry discount'
            break
    assert found_bulk, 'expected at least one multi-qty cart in 40 draws'


def test_build_order_items_no_discount_below_five():
    bases, pizzas, toppings = _load_menu()
    rng = random.Random(7)
    for _ in range(30):
        items = seed.build_order_items(rng, bases, pizzas, toppings)
        total_qty = sum(i.quantity for i in items)
        if total_qty < 5:
            assert all(i.line_discount == Decimal('0') for i in items)
            return
    raise AssertionError('expected a sub-5-qty cart in 30 draws')


def test_pairing_boost_uses_menu_topping_names():
    bases, pizzas, toppings = _load_menu()
    topping_names = {t['name'] for t in toppings}
    for names in seed.PAIRING_BOOST.values():
        assert all(n in topping_names for n in names)


def test_backdate_order_code_uses_business_date_sequence(monkeypatch):
    """Each backdate on the same business_date should increment order_sequence."""

    class FakeCursor:
        def __init__(self):
            self.seq = 0
            self.updates = []

        def execute(self, sql, params=None):
            sql_norm = ' '.join(sql.split())
            if sql_norm.startswith('SELECT id FROM orders WHERE public_id'):
                self._last = {'id': 101}
            elif 'MAX(order_sequence)' in sql_norm:
                self.seq += 1
                self._last = {'next_seq': self.seq}
            elif sql_norm.startswith('UPDATE orders SET'):
                self.updates.append(params)

        def fetchone(self):
            return self._last

    cur = FakeCursor()
    store_id = 1
    biz = seed.datetime(2026, 7, 1, 12, 0, tzinfo=seed.IST).astimezone(seed.timezone.utc)

    seed.backdate_order(cur, 'uuid-1', biz, store_id)
    seed.backdate_order(cur, 'uuid-2', biz, store_id)

    codes = [u[4] for u in cur.updates]
    assert codes == ['SM-0001', 'SM-0002']
