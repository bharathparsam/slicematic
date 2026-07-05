"""Tests for daily ratings analytics."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


@patch('main.ratings_daily')
def test_ratings_daily_api(mock_ratings):
    mock_ratings.return_value = {
        'days': [
            {'business_date': '2026-07-01', 'ratings_count': 2, 'avg_rating': 4.5},
            {'business_date': '2026-07-02', 'ratings_count': 0, 'avg_rating': None},
        ]
    }

    res = client.get('/api/analytics/ratings_daily?days=7')

    assert res.status_code == 200
    body = res.json()
    assert len(body['days']) == 2
    assert float(body['days'][0]['avg_rating']) == 4.5
    assert body['days'][1]['ratings_count'] == 0
