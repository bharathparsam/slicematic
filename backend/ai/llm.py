"""OpenRouter LLM client factory (official SDK)."""

import os
from pathlib import Path
from typing import Any

DEFAULT_BRIEF_MODEL = 'google/gemini-2.5-flash'
DEFAULT_CHAT_MODEL = 'google/gemini-2.5-flash'


class LLMError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _require_api_key() -> str:
    key = os.getenv('OPENROUTER_API_KEY', '').strip()
    if not key:
        raise LLMError(
            'AI unavailable — set OPENROUTER_API_KEY in backend/.env',
            status_code=503,
        )
    return key


def chat_complete(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 1024,
) -> dict[str, Any]:
    """Send chat completion via OpenRouter SDK."""
    from openrouter import OpenRouter

    api_key = _require_api_key()
    chosen = model or os.getenv('COO_CHAT_MODEL') or os.getenv('OPENROUTER_MODEL') or DEFAULT_CHAT_MODEL

    try:
        with OpenRouter(api_key=api_key) as client:
            response = client.chat.send(
                model=chosen,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
    except Exception as exc:
        msg = str(exc)
        if '401' in msg or 'Unauthorized' in msg:
            raise LLMError('Invalid OPENROUTER_API_KEY', status_code=503) from exc
        if '429' in msg:
            raise LLMError('AI rate limit hit — wait a moment', status_code=429) from exc
        raise LLMError(f'Could not reach OpenRouter: {msg}', status_code=502) from exc

    content = ''
    if response.choices:
        msg = response.choices[0].message
        content = (getattr(msg, 'content', None) or '').strip()

    if not content:
        raise LLMError('OpenRouter returned an empty reply', status_code=502)

    return {
        'reply': content,
        'model': getattr(response, 'model', None) or chosen,
    }


def load_prompt(name: str) -> str:
    path = Path(__file__).parent / 'prompts' / name
    return path.read_text(encoding='utf-8')
