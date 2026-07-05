import { useEffect, useState } from 'react'
import {
  STAFF_ROLES,
  createAdminStaff,
  deactivateAdminStaff,
  listAdminStaff,
  updateAdminStaff,
} from '@/lib/adminStaffStore'
import { validateName } from '@/lib/validators'
import { C, FONT_DISPLAY } from '@/components/order/theme'
import PizzaLoader from '@/components/order/PizzaLoader'

const ROLE_LABELS = {
  staff: 'Staff',
  manager: 'Manager',
  admin: 'Admin',
}

/**
 * Admin "Staff" tab — add/remove employees and assign roles.
 */
export default function AdminStaff() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [showInactive, setShowInactive] = useState(true)

  const [name, setName] = useState('')
  const [role, setRole] = useState('staff')
  const [pin, setPin] = useState('')
  const [nameError, setNameError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingPinId, setEditingPinId] = useState('')
  const [pinDraft, setPinDraft] = useState('')

  async function refresh() {
    setLoading(true)
    setLoadError('')
    const result = await listAdminStaff(showInactive)
    setLoading(false)
    if (!result.ok) {
      setLoadError(result.message || 'Could not load staff.')
      setStaff([])
      return
    }
    setStaff(result.staff)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive])

  async function handleAdd(e) {
    e.preventDefault()
    const check = validateName(name)
    setNameError(check.error)
    if (!check.valid) return
    if (pin && (!/^\d{4}$/.test(pin))) {
      setActionError('PIN must be exactly 4 digits.')
      return
    }

    setAdding(true)
    setActionError('')
    const result = await createAdminStaff({
      full_name: name.trim(),
      role,
      pin: pin || null,
    })
    setAdding(false)
    if (!result.ok) {
      setActionError(result.message || 'Could not add staff member.')
      return
    }
    setName('')
    setRole('staff')
    setPin('')
    await refresh()
  }

  async function changeRole(member, nextRole) {
    if (member.role === nextRole || busyId) return
    setBusyId(String(member.id))
    setActionError('')
    const result = await updateAdminStaff(member.id, { role: nextRole })
    setBusyId('')
    if (!result.ok) {
      setActionError(result.message || 'Could not update role.')
      return
    }
    await refresh()
  }

  async function toggleActive(member) {
    if (busyId) return
    setBusyId(String(member.id))
    setActionError('')
    const result = member.is_active
      ? await deactivateAdminStaff(member.id)
      : await updateAdminStaff(member.id, { is_active: true })
    setBusyId('')
    if (!result.ok) {
      setActionError(result.message || 'Could not update staff status.')
      return
    }
    await refresh()
  }

  function startPinEdit(member) {
    if (busyId || !member.is_active) return
    setEditingPinId(String(member.id))
    setPinDraft('')
    setActionError('')
  }

  function cancelPinEdit() {
    setEditingPinId('')
    setPinDraft('')
  }

  async function savePin(member) {
    if (pinDraft && !/^\d{4}$/.test(pinDraft)) {
      setActionError('PIN must be exactly 4 digits.')
      return
    }
    setBusyId(String(member.id))
    setActionError('')
    const result = await updateAdminStaff(member.id, { pin: pinDraft || null })
    setBusyId('')
    if (!result.ok) {
      setActionError(result.message || 'Could not update PIN.')
      return
    }
    setEditingPinId('')
    setPinDraft('')
    await refresh()
  }

  const activeCount = staff.filter((s) => s.is_active).length

  return (
    <main className="min-h-0 flex-1 overflow-auto p-5 sm:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, margin: 0, color: C.ink }}>
            Staff
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: C.brown2, fontWeight: 600 }}>
            {activeCount} active · kitchen picker uses active staff only
          </p>
        </div>
        <label className="flex items-center gap-2" style={{ fontSize: 13, color: C.brown2, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {loadError && (
        <p className="mb-4 rounded-xl px-4 py-3" style={{ background: '#fde8e4', color: C.red, fontSize: 13.5 }}>
          {loadError}
        </p>
      )}
      {actionError && (
        <p className="mb-4 rounded-xl px-4 py-3" style={{ background: '#fde8e4', color: C.red, fontSize: 13.5 }}>
          {actionError}
        </p>
      )}

      <form
        onSubmit={handleAdd}
        className="mb-8 rounded-2xl p-5"
        style={{ background: '#fff', border: `1.5px solid ${C.border}` }}
      >
        <div
          className="mb-4 uppercase"
          style={{ fontSize: 11, letterSpacing: '0.16em', color: '#b0987a', fontWeight: 700 }}
        >
          Add employee
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span style={{ fontSize: 12, fontWeight: 700, color: C.brown2 }}>Full name</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError('')
              }}
              placeholder="Priya Singh"
              className="rounded-xl px-3 py-2.5"
              style={{ border: `1.5px solid ${nameError ? C.red : C.border2}`, fontSize: 14 }}
              aria-invalid={nameError ? true : undefined}
            />
            {nameError && (
              <span style={{ fontSize: 12, color: C.red }}>{nameError}</span>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span style={{ fontSize: 12, fontWeight: 700, color: C.brown2 }}>Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-xl px-3 py-2.5"
              style={{ border: `1.5px solid ${C.border2}`, fontSize: 14, background: '#fff' }}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span style={{ fontSize: 12, fontWeight: 700, color: C.brown2 }}>PIN (optional)</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="4 digits"
              className="rounded-xl px-3 py-2.5"
              style={{ border: `1.5px solid ${C.border2}`, fontSize: 14 }}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={adding}
              className="w-full rounded-xl px-4 py-2.5 font-bold disabled:opacity-60"
              style={{ background: C.red, color: C.cream, fontSize: 14 }}
            >
              {adding ? 'Adding…' : 'Add staff'}
            </button>
          </div>
        </div>
      </form>

      {loading ? (
        <PizzaLoader variant="inline" />
      ) : (
        <div className="overflow-x-auto rounded-2xl" style={{ border: `1.5px solid ${C.border}` }}>
          <table className="w-full min-w-[640px]" style={{ borderCollapse: 'collapse', background: '#fff' }}>
            <thead>
              <tr style={{ background: '#f5ead8', textAlign: 'left' }}>
                {['Name', 'Role', 'PIN', 'Status', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 uppercase"
                    style={{ fontSize: 11, letterSpacing: '0.14em', color: '#9a8268', fontWeight: 700 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center" style={{ color: C.brown2, fontSize: 14 }}>
                    No staff yet — add your first team member above.
                  </td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="px-4 py-3" style={{ fontWeight: 700, color: C.ink }}>
                      {member.full_name}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={member.role}
                        disabled={!member.is_active || busyId === String(member.id)}
                        onChange={(e) => changeRole(member, e.target.value)}
                        className="rounded-lg px-2 py-1.5"
                        style={{
                          border: `1px solid ${C.border2}`,
                          fontSize: 13,
                          background: member.is_active ? '#fff' : '#f5f0e8',
                        }}
                      >
                        {STAFF_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {editingPinId === String(member.id) ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={pinDraft}
                            onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            inputMode="numeric"
                            placeholder={member.has_pin ? 'New PIN' : '4 digits'}
                            autoFocus
                            className="w-24 rounded-lg px-2 py-1.5"
                            style={{ border: `1px solid ${C.border2}`, fontSize: 13 }}
                          />
                          <button
                            type="button"
                            disabled={busyId === String(member.id)}
                            onClick={() => savePin(member)}
                            className="rounded-lg px-2.5 py-1.5 font-semibold disabled:opacity-60"
                            style={{ fontSize: 12, background: C.red, color: C.cream }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelPinEdit}
                            className="rounded-lg px-2.5 py-1.5 font-semibold"
                            style={{ fontSize: 12, background: '#fff', border: `1px solid ${C.border2}`, color: C.brown2 }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 13, color: C.brown2 }}>
                            {member.has_pin ? 'Set' : '—'}
                          </span>
                          {member.is_active && (
                            <button
                              type="button"
                              disabled={!!busyId}
                              onClick={() => startPinEdit(member)}
                              className="rounded-lg px-2 py-1 font-semibold disabled:opacity-60"
                              style={{ fontSize: 12, background: '#fff', border: `1px solid ${C.border2}`, color: C.brown2 }}
                            >
                              {member.has_pin ? 'Change' : 'Set PIN'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2.5 py-1 font-bold uppercase"
                        style={{
                          fontSize: 10.5,
                          letterSpacing: '0.08em',
                          background: member.is_active ? '#e8f5e9' : '#f0ebe3',
                          color: member.is_active ? '#2e7d32' : '#8a7a68',
                        }}
                      >
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyId === String(member.id)}
                        onClick={() => toggleActive(member)}
                        className="rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60"
                        style={{
                          fontSize: 12.5,
                          background: member.is_active ? '#fff' : C.red,
                          color: member.is_active ? C.red : C.cream,
                          border: member.is_active ? `1px solid ${C.red}` : 'none',
                        }}
                      >
                        {member.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
