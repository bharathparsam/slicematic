"""Tests for briefing fallback bullets."""

from ai.briefing import _deterministic_brief


def test_deterministic_brief_has_sections():
    snapshot = {
        'categories': {
            'order_times': {'primary': {'value': 11.2}, 'secondary': {'slowest_pizza': 'Farm House'}},
            'cancellations': {'primary': {'value': 4.2}, 'secondary': {'count': 3}},
            'table_utilisation': {'primary': {'value': 34}},
            'sales': {'primary': {'value': 42300}, 'secondary': {'orders': 47}},
        }
    }
    text = _deterministic_brief(snapshot)
    assert 'What went well' in text or 'went well' in text.lower()
    assert 'Farm House' in text or '11.2' in text
