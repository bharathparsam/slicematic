"""Tests for one-time order rating."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
ORDER_ID = '00000000-0000-4000-8000-000000000001'


@patch('main.rate_order')
def test_rate_order_api(mock_rate):
    mock_rate.return_value = {
        'order_id': ORDER_ID,
        'order_code': 'SM-0001',
        'table': 'Table 3',
        'rating': 4,
    }

    res = client.post('/api/rate_order', json={'order_id': ORDER_ID, 'rating': 4})

    assert res.status_code == 200
    assert res.json()['rating'] == 4


@patch('main.rate_order')
def test_rate_order_api_rejects_duplicate(mock_rate):
    from queries import OrderAlreadyRatedError

    mock_rate.side_effect = OrderAlreadyRatedError('This order has already been rated')

    res = client.post('/api/rate_order', json={'order_id': ORDER_ID, 'rating': 5})

    assert res.status_code == 409
    assert 'already been rated' in res.json()['detail'].lower()
