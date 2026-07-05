"""Tests for chat graph routing (no LLM calls)."""

from ai.chat_graph import (
    _extract_sql,
    classify_intent,
    reject_node,
    route_after_classify,
)


def test_classify_rejects_offtopic():
    state = classify_intent({'message': 'tell me a joke'})
    assert state['intent'] == 'reject'


def test_classify_accepts_data_question():
    state = classify_intent({'message': 'What was net sales last week?'})
    assert state['intent'] == 'data'


def test_route_reject():
    assert route_after_classify({'intent': 'reject'}) == 'reject'


def test_reject_message():
    out = reject_node({'message': 'hello'})
    assert 'restaurant data' in out['reply'].lower()


def test_extract_sql_fenced():
    raw = '```sql\nSELECT item_name FROM mv_product_sales WHERE store_id = 1\n```'
    assert 'mv_product_sales' in _extract_sql(raw)


def test_extract_sql_with_preamble():
    raw = (
        'To find the top topping:\n\n'
        'SELECT item_name, units_sold FROM mv_product_sales '
        "WHERE store_id = 1 AND role = 'topping' ORDER BY units_sold DESC LIMIT 1"
    )
    sql = _extract_sql(raw)
    assert sql.lower().startswith('select')
    assert 'units_sold' in sql.lower()


def test_extract_sql_none_for_plain_answer():
    assert _extract_sql('Green Peppers is the most popular topping.') is None


def test_fallback_answer_top_topping():
    from ai.chat_graph import _fallback_answer, _looks_like_raw_table

    reply = _fallback_answer(
        'which is the most ordered topping?',
        [{'item_name': 'Green Peppers', 'items_sold': 3}],
    )
    assert 'Green Peppers' in reply
    assert 'item_name' not in reply.lower()
    assert _looks_like_raw_table('item_name, items_sold')
