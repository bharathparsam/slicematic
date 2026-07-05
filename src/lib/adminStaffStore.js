// adminStaffStore.js — Admin CRUD seam for store staff (name, role, optional PIN).

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export const STAFF_ROLES = Object.freeze(['staff', 'manager', 'admin'])

async function apiFetch(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* keep statusText */
    }
    return { ok: false, message: detail || 'Request failed' }
  }
  const data = await res.json()
  return { ok: true, data }
}

/** List staff for admin management (includes inactive by default). */
export async function listAdminStaff(includeInactive = true) {
  const params = includeInactive ? '' : '?include_inactive=false'
  const res = await apiFetch(`/api/admin/staff${params}`)
  if (!res.ok) {
    console.warn('[adminStaffStore] list failed', res.message)
    return { ok: false, message: res.message, staff: [] }
  }
  return { ok: true, staff: res.data ?? [] }
}

/** Add a staff member. PIN optional (4 digits). */
export async function createAdminStaff({ full_name, role = 'staff', pin = null }) {
  const body = { full_name: full_name?.trim(), role }
  if (pin) body.pin = pin
  const res = await apiFetch('/api/admin/staff', { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) return { ok: false, message: res.message }
  return { ok: true, staff: res.data }
}

/** Update name, role, PIN, or reactivate a deactivated staff member. */
export async function updateAdminStaff(staffId, patch) {
  const res = await apiFetch(`/api/admin/staff/${staffId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!res.ok) return { ok: false, message: res.message }
  return { ok: true, staff: res.data }
}

/** Soft-delete (deactivate) a staff member. */
export async function deactivateAdminStaff(staffId) {
  const res = await apiFetch(`/api/admin/staff/${staffId}`, { method: 'DELETE' })
  if (!res.ok) return { ok: false, message: res.message }
  return { ok: true, staff: res.data }
}
