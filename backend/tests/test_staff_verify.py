"""Tests for POST /api/staff/verify."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


@patch('main.verify_staff_pin')
def test_verify_staff_success(mock_verify):
    mock_verify.return_value = {
        'id': 2,
        'full_name': 'Priya Singh',
        'role': 'staff',
        'has_pin': True,
    }

    res = client.post('/api/staff/verify', json={'staff_id': 2, 'pin': '0000'})

    assert res.status_code == 200
    body = res.json()
    assert body['id'] == 2
    assert body['full_name'] == 'Priya Singh'
    assert body['has_pin'] is True
    assert 'pin' not in body


@patch('main.verify_staff_pin')
def test_verify_staff_wrong_pin(mock_verify):
    mock_verify.return_value = None

    res = client.post('/api/staff/verify', json={'staff_id': 2, 'pin': '9999'})

    assert res.status_code == 401
    assert 'Invalid PIN' in res.json()['detail']


def test_verify_staff_invalid_pin_format():
    res = client.post('/api/staff/verify', json={'staff_id': 2, 'pin': '12ab'})

    assert res.status_code == 422


@patch('kitchen.db_cursor')
@patch('kitchen.ensure_store', return_value=1)
def test_verify_staff_pin_query(mock_store, mock_db):
    from kitchen import verify_staff_pin

    cur = MagicMock()
    cur.fetchone.return_value = {
        'id': 3,
        'full_name': 'Amit Sharma',
        'role': 'manager',
    }
    mock_db.return_value.__enter__.return_value = (None, cur)

    out = verify_staff_pin(3, '0000')

    assert out == {
        'id': 3,
        'full_name': 'Amit Sharma',
        'role': 'manager',
        'has_pin': True,
    }
    sql = cur.execute.call_args[0][0]
    assert 'pin = %s' in sql
    assert cur.execute.call_args[0][1] == (3, '0000', 1)


@patch('kitchen.db_cursor')
@patch('kitchen.ensure_store', return_value=1)
def test_verify_staff_pin_not_found(mock_store, mock_db):
    from kitchen import verify_staff_pin

    cur = MagicMock()
    cur.fetchone.return_value = None
    mock_db.return_value.__enter__.return_value = (None, cur)

    assert verify_staff_pin(99, '0000') is None
