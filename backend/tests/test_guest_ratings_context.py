"""Tests for guest rating analytics context."""

from analytics_summary import format_guest_ratings_context


def test_format_guest_ratings_context():
    ctx = format_guest_ratings_context(
        {
            'primary': {'value': 4.3},
            'secondary': {'ratings_count': 5, 'response_rate_pct': 50.0},
            'details': {'ratings_daily': [], 'distribution': {'5': 2, '4': 3}},
        },
        days=7,
    )
    assert ctx is not None
    assert 'Guest order rating stats' in ctx
    assert '4.3' in ctx
    assert 'ratings_count' in ctx


def test_format_guest_ratings_context_empty():
    assert format_guest_ratings_context(None) is None
