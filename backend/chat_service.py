import json
import os

from analytics_context import build_analytics_context
from openrouter_client import OpenRouterError, chat_completion

COO_SYSTEM_PROMPT = """You are SliceMatic's operations assistant ("COO") for a pizza shop in Delhi.

Rules:
- Answer ONLY using the analytics_context JSON provided below. Do not invent numbers.
- If the data cannot answer the question, say so plainly and suggest what is available.
- Use Indian Rupees (₹), Asia/Kolkata dates/times, and plain language for counter staff.
- Keep answers concise: 2–5 sentences unless the user asks for a breakdown.
- When citing figures, be specific (amounts, counts, dates, pizza names, payment methods).
- Never mention customer phone numbers or other personal data — you only have aggregates.
- Do not claim real-time kitchen status or inventory you were not given.

analytics_context:
"""


def _trim_history(history: list[dict], max_turns: int) -> list[dict]:
    cleaned = []
    for turn in history[-max_turns:]:
        role = turn.get('role')
        content = (turn.get('content') or '').strip()
        if role in ('user', 'assistant') and content:
            cleaned.append({'role': role, 'content': content})
    return cleaned


def answer_analytics_question(message: str, history: list[dict] | None = None) -> dict:
    """Build context, call OpenRouter, return assistant reply."""
    text = (message or '').strip()
    if not text:
        raise ValueError('Message is required')

    max_chars = int(os.getenv('CHAT_MAX_MESSAGE_CHARS', '500'))
    if len(text) > max_chars:
        raise ValueError(f'Message must be at most {max_chars} characters')

    max_history = int(os.getenv('CHAT_MAX_HISTORY', '10'))
    prior = _trim_history(history or [], max_history)

    context = build_analytics_context()
    system_content = COO_SYSTEM_PROMPT + json.dumps(context, ensure_ascii=False, indent=2)

    messages = [{'role': 'system', 'content': system_content}, *prior, {'role': 'user', 'content': text}]

    try:
        result = chat_completion(messages)
    except OpenRouterError:
        raise

    return {
        'reply': result['reply'],
        'model': result['model'],
        'context_as_of': context['as_of'],
    }
