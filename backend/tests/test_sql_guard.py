"""Tests for COO SQL guard."""

import pytest

from ai.sql_guard import validate_and_sanitize_sql


def test_valid_select():
    r = validate_and_sanitize_sql(
        'SELECT pizza_name FROM mv_item_prep_stats WHERE store_id = 1 LIMIT 5'
    )
    assert r.ok
    assert 'SELECT' in r.sql.upper()


def test_rejects_insert():
    r = validate_and_sanitize_sql('INSERT INTO orders VALUES (1)')
    assert not r.ok


def test_rejects_drop():
    r = validate_and_sanitize_sql('SELECT 1; DROP TABLE orders')
    assert not r.ok


def test_rejects_disallowed_table():
    r = validate_and_sanitize_sql('SELECT * FROM secret_table WHERE store_id = 1')
    assert not r.ok


def test_injects_store_id():
    r = validate_and_sanitize_sql('SELECT count(*) FROM orders')
    assert r.ok
    assert 'store_id = 1' in r.sql.lower()


def test_injects_limit():
    r = validate_and_sanitize_sql('SELECT * FROM orders WHERE store_id = 1')
    assert r.ok
    assert 'LIMIT 500' in r.sql.upper()


def test_rejects_auth_user_id():
    r = validate_and_sanitize_sql(
        'SELECT auth_user_id FROM staff WHERE store_id = 1'
    )
    assert not r.ok


def test_extracts_fenced_sql():
    raw = 'Here is the query:\n```sql\nSELECT 1 FROM mv_daily_sales WHERE store_id = 1\n```'
    r = validate_and_sanitize_sql(raw)
    assert r.ok
    assert 'mv_daily_sales' in r.sql


def test_allows_materialized_views():
    r = validate_and_sanitize_sql(
        'SELECT * FROM mv_cancellation_stages WHERE store_id = 1 LIMIT 10'
    )
    assert r.ok


def test_allows_order_feedback_with_orders_join():
    r = validate_and_sanitize_sql(
        '''
        SELECT round(avg(f.rating)::numeric, 2) AS avg_rating
        FROM order_feedback f
        JOIN orders o ON o.id = f.order_id
        WHERE o.store_id = 1
        '''
    )
    assert r.ok
    assert 'order_feedback' in r.sql.lower()


def test_order_by_column_not_treated_as_table():
    r = validate_and_sanitize_sql(
        '''
        SELECT item_name, units_sold
        FROM mv_product_sales
        WHERE store_id = 1 AND role = 'topping'
        ORDER BY units_sold DESC
        LIMIT 1
        '''
    )
    assert r.ok
    assert 'mv_product_sales' in r.sql.lower()
