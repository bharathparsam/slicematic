const API_BASE = import.meta.env.VITE_API_URL ?? ''
const THREAD_KEY = 'slicematic_coo_thread_id'

async function apiFetch(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch { /* keep */ }
    throw new Error(detail || 'Request failed')
  }
  if (res.status === 204) return null
  return res.json()
}

export function getStoredThreadId() {
  try {
    return sessionStorage.getItem(THREAD_KEY)
  } catch {
    return null
  }
}

export function setStoredThreadId(id) {
  try {
    if (id) sessionStorage.setItem(THREAD_KEY, id)
    else sessionStorage.removeItem(THREAD_KEY)
  } catch { /* ignore */ }
}

export async function getLatestBriefing() {
  try {
    return await apiFetch('/api/coo/briefing/latest')
  } catch (err) {
    console.warn('[cooStore] briefing fetch failed', err)
    return null
  }
}

export async function generateBriefing() {
  return apiFetch('/api/coo/briefing/generate', { method: 'POST' })
}

export async function sendChatMessage({ message, threadId, briefingId }) {
  const result = await apiFetch('/api/coo/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      thread_id: threadId || null,
      briefing_id: briefingId || null,
    }),
  })
  if (result?.thread_id) setStoredThreadId(result.thread_id)
  return result
}

export async function getChatHistory(threadId) {
  try {
    return await apiFetch(`/api/coo/chat/threads/${threadId}/messages`)
  } catch {
    return []
  }
}
