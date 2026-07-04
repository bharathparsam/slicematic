import os
from typing import Any

import httpx

OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
DEFAULT_MODEL = 'google/gemini-2.5-flash'
DEFAULT_TIMEOUT = 30.0


class OpenRouterError(Exception):
    """Raised when OpenRouter returns an error or the request fails."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _headers() -> dict[str, str]:
    api_key = os.getenv('OPENROUTER_API_KEY', '').strip()
    if not api_key:
        raise OpenRouterError(
            'Chat unavailable — set OPENROUTER_API_KEY in backend/.env',
            status_code=503,
        )

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    site_url = os.getenv('OPENROUTER_SITE_URL', '').strip()
    app_name = os.getenv('OPENROUTER_APP_NAME', '').strip()
    if site_url:
        headers['HTTP-Referer'] = site_url
    if app_name:
        headers['X-Title'] = app_name
    return headers


def chat_completion(messages: list[dict[str, str]], *, temperature: float = 0.2) -> dict[str, Any]:
    """Call OpenRouter chat/completions and return the parsed JSON body."""
    model = os.getenv('OPENROUTER_MODEL', DEFAULT_MODEL).strip() or DEFAULT_MODEL
    payload = {
        'model': model,
        'messages': messages,
        'temperature': temperature,
        'max_tokens': 1024,
    }

    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
            res = client.post(OPENROUTER_URL, headers=_headers(), json=payload)
    except httpx.TimeoutException as exc:
        raise OpenRouterError('AI service timed out — try again', status_code=504) from exc
    except httpx.HTTPError as exc:
        raise OpenRouterError('Could not reach OpenRouter', status_code=502) from exc

    if res.status_code == 401:
        raise OpenRouterError('Invalid OPENROUTER_API_KEY', status_code=503)
    if res.status_code == 429:
        raise OpenRouterError('AI rate limit hit — wait a moment', status_code=429)
    if res.status_code >= 500:
        raise OpenRouterError('OpenRouter provider error — try again', status_code=502)
    if not res.is_success:
        detail = res.text[:200] if res.text else res.reason_phrase
        raise OpenRouterError(f'OpenRouter error: {detail}', status_code=502)

    data = res.json()
    choices = data.get('choices') or []
    if not choices:
        raise OpenRouterError('OpenRouter returned an empty response', status_code=502)

    content = (choices[0].get('message') or {}).get('content') or ''
    if not str(content).strip():
        raise OpenRouterError('OpenRouter returned an empty reply', status_code=502)

    return {
        'reply': str(content).strip(),
        'model': data.get('model') or model,
    }
