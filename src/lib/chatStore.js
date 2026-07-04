// chatStore.js — Admin COO chat seam (OpenRouter via backend).

const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
      else if (Array.isArray(body.detail)) detail = body.detail.map((d) => d.msg).join(', ')
    } catch {
      /* keep statusText */
    }
    throw new Error(detail || 'Request failed')
  }

  return res.json()
}

/**
 * @param {string} message
 * @param {{ role: 'user' | 'assistant', content: string }[]} history
 */
export async function sendChatMessage(message, history = []) {
  return apiFetch('/api/analytics/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  })
}
