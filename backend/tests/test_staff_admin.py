"""Tests for admin staff CRUD (queries layer)."""

from unittest.mock import MagicMock, patch

import pytest

from queries import (
    StaffNotFoundError,
    create_staff,
    deactivate_staff,
    list_staff_admin,
    update_staff,
)


def _mock_cursor(rows=None, fetchone=None):
    cur = MagicMock()
    cur.fetchall.return_value = rows or []
    cur.fetchone.return_value = fetchone
    return cur


@patch('queries.db_cursor')
@patch('queries.ensure_store', return_value=1)
def test_list_staff_admin_active_only(mock_store, mock_db):
    cur = _mock_cursor(
        rows=[
            {'id': 1, 'full_name': 'Raj', 'role': 'staff', 'pin': '1234', 'is_active': True},
        ]
    )
    mock_db.return_value.__enter__.return_value = (None, cur)

    out = list_staff_admin(include_inactive=False)

    assert len(out) == 1
    assert out[0]['full_name'] == 'Raj'
    sql = cur.execute.call_args[0][0]
    assert 'is_active = true' in sql


@patch('queries.db_cursor')
@patch('queries.ensure_store', return_value=1)
def test_create_staff(mock_store, mock_db):
    cur = _mock_cursor(
        fetchone={
            'id': 5,
            'full_name': 'New Hire',
            'role': 'manager',
            'pin': '9999',
            'is_active': True,
        }
    )
    mock_db.return_value.__enter__.return_value = (None, cur)

    out = create_staff('New Hire', 'manager', '9999')

    assert out['id'] == 5
    assert out['role'] == 'manager'
    assert out['has_pin'] is True


@patch('queries.db_cursor')
@patch('queries.ensure_store', return_value=1)
def test_create_staff_invalid_role(mock_store, mock_db):
    with pytest.raises(ValueError, match='Invalid role'):
        create_staff('Bad Role', 'owner')


@patch('queries.db_cursor')
@patch('queries.ensure_store', return_value=1)
def test_update_staff_pin(mock_store, mock_db):
    cur = _mock_cursor(
        fetchone={
            'id': 2,
            'full_name': 'Priya',
            'role': 'staff',
            'pin': '5678',
            'is_active': True,
        }
    )
    mock_db.return_value.__enter__.return_value = (None, cur)

    out = update_staff(2, pin='5678', pin_set=True)

    assert out['has_pin'] is True
    sql = cur.execute.call_args[0][0]
    assert 'pin = %s' in sql


@patch('queries.db_cursor')
@patch('queries.ensure_store', return_value=1)
def test_update_staff_role(mock_store, mock_db):
    cur = _mock_cursor(
        fetchone={
            'id': 2,
            'full_name': 'Priya',
            'role': 'admin',
            'pin': None,
            'is_active': True,
        }
    )
    mock_db.return_value.__enter__.return_value = (None, cur)

    out = update_staff(2, role='admin')

    assert out['role'] == 'admin'


@patch('queries.db_cursor')
@patch('queries.ensure_store', return_value=1)
def test_update_staff_not_found(mock_store, mock_db):
    cur = _mock_cursor(fetchone=None)
    mock_db.return_value.__enter__.return_value = (None, cur)

    with pytest.raises(StaffNotFoundError):
        update_staff(999, role='staff')


@patch('queries.db_cursor')
@patch('queries.ensure_store', return_value=1)
def test_deactivate_staff(mock_store, mock_db):
    cur = _mock_cursor(
        fetchone={
            'id': 3,
            'full_name': 'Neha',
            'role': 'staff',
            'pin': '4567',
            'is_active': False,
        }
    )
    mock_db.return_value.__enter__.return_value = (None, cur)

    out = deactivate_staff(3)

    assert out['is_active'] is False
