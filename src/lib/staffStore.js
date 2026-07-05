const API_BASE = import.meta.env.VITE_API_URL ?? ''
const STAFF_KEY = 'slicematic_staff_id'
const STAFF_NAME_KEY = 'slicematic_staff_name'
const STAFF_ROLE_KEY = 'slicematic_staff_role'
const STAFF_VERIFIED_KEY = 'slicematic_staff_verified'

async function apiFetch(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch { /* keep */ }
    return { ok: false, message: detail }
  }
  const data = await res.json()
  return { ok: true, data }
}

export function isStaffVerified() {
  try {
    return sessionStorage.getItem(STAFF_VERIFIED_KEY) === 'true'
  } catch {
    return false
  }
}

export function clearStaffSession() {
  try {
    sessionStorage.removeItem(STAFF_KEY)
    sessionStorage.removeItem(STAFF_NAME_KEY)
    sessionStorage.removeItem(STAFF_ROLE_KEY)
    sessionStorage.removeItem(STAFF_VERIFIED_KEY)
  } catch { /* ignore */ }
}

export function getSelectedStaff() {
  try {
    const id = sessionStorage.getItem(STAFF_KEY)
    const name = sessionStorage.getItem(STAFF_NAME_KEY)
    const role = sessionStorage.getItem(STAFF_ROLE_KEY)
    if (!id) return null
    return { id: Number(id), full_name: name || '', role: role || '' }
  } catch {
    return null
  }
}

export function setSelectedStaff(staff) {
  try {
    if (!staff) {
      clearStaffSession()
      return
    }
    sessionStorage.setItem(STAFF_KEY, String(staff.id))
    sessionStorage.setItem(STAFF_NAME_KEY, staff.full_name || '')
    sessionStorage.setItem(STAFF_ROLE_KEY, staff.role || '')
    if (staff.verified) {
      sessionStorage.setItem(STAFF_VERIFIED_KEY, 'true')
    } else {
      sessionStorage.removeItem(STAFF_VERIFIED_KEY)
    }
  } catch { /* ignore */ }
}

export async function verifyStaff(staffId, pin) {
  const res = await apiFetch('/api/staff/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staff_id: staffId, pin }),
  })
  if (!res.ok) {
    return { ok: false, message: res.message || 'Invalid PIN' }
  }
  const staff = res.data
  setSelectedStaff({ ...staff, verified: true })
  return { ok: true, staff }
}

export async function listStaff() {
  const res = await apiFetch('/api/staff')
  if (!res.ok) {
    console.warn('[staffStore] list failed', res.message)
    return []
  }
  return res.data ?? []
}
