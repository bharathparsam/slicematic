"""Tests for rule-based suggestion ranking (R1–R3 helpers)."""

from datetime import datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

from suggestions import (
    DEFAULT_CONFIG,
    _hour_filter_clause,
    build_menu_suggestions,
    build_suggestions,
    hour_bucket,
)

IST = ZoneInfo('Asia/Kolkata')


def test_hour_bucket_lunch():
    assert hour_bucket(12) == 'lunch'
    assert hour_bucket(11) == 'lunch'
    assert hour_bucket(14) == 'lunch'


def test_hour_bucket_evening():
    assert hour_bucket(18) == 'evening'


def test_hour_bucket_morning():
    assert hour_bucket(10) == 'morning'


def test_hour_bucket_late():
    assert hour_bucket(22) == 'late'


def test_hour_bucket_other():
    assert hour_bucket(8) == 'other'
    assert hour_bucket(16) == 'other'


def test_hour_filter_clause_lunch():
    clause, params = _hour_filter_clause('lunch', DEFAULT_CONFIG['hour_buckets'])
    assert 'EXTRACT(HOUR' in clause
    assert params == [11, 15]


def test_hour_filter_clause_other_excludes_named_buckets():
    clause, params = _hour_filter_clause('other', DEFAULT_CONFIG['hour_buckets'])
    assert 'NOT IN' in clause
    assert 12 in params
    assert 18 in params


@patch('suggestions.db_cursor')
def test_build_suggestions_empty_when_pizza_unresolved(mock_db):
    mock_cur = MagicMock()
    mock_db.return_value.__enter__.return_value = (None, mock_cur)

    with patch('suggestions.ensure_store', return_value=1):
        with patch('suggestions.resolve_item_name', return_value=None):
            out = build_suggestions('P99', pizza_name=None)

    assert out == {'suggestions': []}


@patch('suggestions.db_cursor')
def test_build_suggestions_sparse_history_returns_empty(mock_db):
    mock_cur = MagicMock()
    mock_db.return_value.__enter__.return_value = (None, mock_cur)

    with patch('suggestions.ensure_store', return_value=1):
        with patch('suggestions.resolve_item_name', return_value='Margherita'):
            with patch('suggestions._count_settled_pizza_orders', return_value=2):
                out = build_suggestions(
                    'P1',
                    pizza_name='Margherita',
                    config={'min_orders_for_suggestions': 5},
                )

    assert out == {'suggestions': []}


@patch('suggestions.db_cursor')
def test_build_suggestions_pairing_rule(mock_db):
    mock_cur = MagicMock()
    mock_db.return_value.__enter__.return_value = (None, mock_cur)

    pairing_row = {'name': 'Extra Cheese', 'pair_count': 12}

    with patch('suggestions.ensure_store', return_value=1):
        with patch('suggestions.resolve_item_name', return_value='Pepperoni Classic'):
            with patch('suggestions._count_settled_pizza_orders', return_value=20):
                with patch(
                    'suggestions._top_paired_toppings',
                    return_value=[pairing_row],
                ):
                    with patch(
                        'suggestions._top_pizza_in_hour_bucket',
                        return_value=None,
                    ):
                        with patch(
                            'suggestions._high_attach_toppings',
                            return_value=[],
                        ):
                            with patch(
                                'suggestions.resolve_item_id',
                                return_value='T1',
                            ):
                                out = build_suggestions(
                                    'P6',
                                    pizza_name='Pepperoni Classic',
                                    now=datetime(2026, 7, 5, 12, 0, tzinfo=IST),
                                )

    assert len(out['suggestions']) == 1
    s = out['suggestions'][0]
    assert s['rule'] == 'pairing'
    assert s['action']['type'] == 'add_topping'
    assert s['action']['item_id'] == 'T1'
    assert 'Extra Cheese' in s['message']


@patch('suggestions.db_cursor')
def test_build_suggestions_hour_bucket_add_pizza_for_other_pizza(mock_db):
    mock_cur = MagicMock()
    mock_db.return_value.__enter__.return_value = (None, mock_cur)

    with patch('suggestions.ensure_store', return_value=1):
        with patch('suggestions.resolve_item_name', return_value='Margherita'):
            with patch('suggestions._count_settled_pizza_orders', return_value=20):
                with patch('suggestions._top_paired_toppings', return_value=[]):
                    with patch(
                        'suggestions._top_pizza_in_hour_bucket',
                        return_value={'name': 'Farm House', 'units': 8},
                    ):
                        with patch(
                            'suggestions.resolve_item_id',
                            return_value='P5',
                        ):
                            with patch(
                                'suggestions._high_attach_toppings',
                                return_value=[],
                            ):
                                out = build_suggestions(
                                    'P1',
                                    pizza_name='Margherita',
                                    now=datetime(2026, 7, 5, 12, 0, tzinfo=IST),
                                )

    assert len(out['suggestions']) == 1
    s = out['suggestions'][0]
    assert s['rule'] == 'hour_bucket'
    assert s['action']['type'] == 'add_pizza'
    assert s['action']['item_id'] == 'P5'
    assert 'Farm House' in s['message']


@patch('suggestions.db_cursor')
def test_build_suggestions_respects_max_two(mock_db):
    mock_cur = MagicMock()
    mock_db.return_value.__enter__.return_value = (None, mock_cur)

    pairs = [
        {'name': 'Extra Cheese', 'pair_count': 10},
        {'name': 'Jalapeno', 'pair_count': 8},
        {'name': 'Olives', 'pair_count': 6},
    ]

    with patch('suggestions.ensure_store', return_value=1):
        with patch('suggestions.resolve_item_name', return_value='Pepperoni Classic'):
            with patch('suggestions._count_settled_pizza_orders', return_value=20):
                with patch('suggestions._top_paired_toppings', return_value=pairs):
                    with patch(
                        'suggestions._top_pizza_in_hour_bucket',
                        return_value=None,
                    ):
                        with patch(
                            'suggestions._high_attach_toppings',
                            return_value=[],
                        ):
                            with patch(
                                'suggestions.resolve_item_id',
                                side_effect=['T1', 'T2', 'T3'],
                            ):
                                out = build_suggestions(
                                    'P6',
                                    pizza_name='Pepperoni Classic',
                                )

    assert len(out['suggestions']) == 2


def test_build_suggestions_excludes_selected_topping_names():
    """Selected topping ids resolve to names and are excluded from pairing."""
    mock_cur = MagicMock()

    with patch('suggestions.db_cursor') as mock_db:
        mock_db.return_value.__enter__.return_value = (None, mock_cur)
        with patch('suggestions.ensure_store', return_value=1):
            with patch(
                'suggestions.resolve_item_name',
                side_effect=lambda _c, _s, role, iid: (
                    'Pepperoni Classic' if role == 'pizza' else 'Extra Cheese'
                ),
            ):
                with patch('suggestions._count_settled_pizza_orders', return_value=20):
                    with patch(
                        'suggestions._top_paired_toppings',
                        return_value=[{'name': 'Jalapeno', 'pair_count': 5}],
                    ) as mock_pair:
                        with patch(
                            'suggestions._top_pizza_in_hour_bucket',
                            return_value=None,
                        ):
                            with patch(
                                'suggestions._high_attach_toppings',
                                return_value=[],
                            ):
                                with patch(
                                    'suggestions.resolve_item_id',
                                    return_value='T2',
                                ):
                                    out = build_suggestions(
                                        'P6',
                                        selected_topping_ids=['T1'],
                                        pizza_name='Pepperoni Classic',
                                    )

    # exclude_names should include resolved "Extra Cheese"
    call_kwargs = mock_pair.call_args
    exclude = call_kwargs[0][5] if call_kwargs else set()
    assert 'Extra Cheese' in exclude
    assert out['suggestions'][0]['action']['item_name'] == 'Jalapeno'


@patch('suggestions.db_cursor')
def test_build_menu_suggestions_empty_when_sparse_history(mock_db):
    mock_cur = MagicMock()
    mock_db.return_value.__enter__.return_value = (None, mock_cur)

    with patch('suggestions.ensure_store', return_value=1):
        with patch('suggestions._count_settled_orders', return_value=1):
            out = build_menu_suggestions(config={'min_orders_for_suggestions': 2})

    assert out == {'suggestions': []}


@patch('suggestions.db_cursor')
def test_build_menu_suggestions_hour_bucket_and_top_seller(mock_db):
    mock_cur = MagicMock()
    mock_db.return_value.__enter__.return_value = (None, mock_cur)

    with patch('suggestions.ensure_store', return_value=1):
        with patch('suggestions._count_settled_orders', return_value=10):
            with patch(
                'suggestions._top_pizza_in_hour_bucket',
                return_value={'name': 'Farm House', 'units': 12},
            ):
                with patch(
                    'suggestions._top_pizza_overall',
                    return_value={'name': 'Margherita', 'units': 40},
                ):
                    with patch(
                        'suggestions.resolve_item_id',
                        side_effect=['P5', 'P1'],
                    ):
                        out = build_menu_suggestions(
                            now=datetime(2026, 7, 5, 12, 0, tzinfo=IST),
                        )

    assert len(out['suggestions']) == 2
    assert out['suggestions'][0]['action']['type'] == 'add_pizza'
    assert out['suggestions'][0]['action']['item_id'] == 'P5'
    assert out['suggestions'][1]['rule'] == 'top_seller'
    assert out['suggestions'][1]['action']['item_id'] == 'P1'


@patch('suggestions.db_cursor')
def test_build_menu_suggestions_excludes_sold_out_ids(mock_db):
    mock_cur = MagicMock()
    mock_db.return_value.__enter__.return_value = (None, mock_cur)

    with patch('suggestions.ensure_store', return_value=1):
        with patch('suggestions._count_settled_orders', return_value=10):
            with patch(
                'suggestions.resolve_item_name',
                return_value='Farm House',
            ):
                with patch(
                    'suggestions._top_pizza_in_hour_bucket',
                    return_value={'name': 'Farm House', 'units': 12},
                ):
                    with patch('suggestions._top_pizza_overall', return_value=None):
                        with patch(
                            'suggestions.resolve_item_id',
                            return_value='P5',
                        ):
                            out = build_menu_suggestions(
                                exclude_pizza_ids=['P5'],
                                now=datetime(2026, 7, 5, 12, 0, tzinfo=IST),
                            )

    assert out == {'suggestions': []}
