import { useState } from 'react'
import {
  clearStaffSession,
  isStaffVerified,
  verifyStaff,
} from '@/lib/staffStore'
import { canManageOrders } from '@/lib/staffRoles'
import { C, FONT_DISPLAY, FONT_BODY } from '@/components/order/theme'

/**
 * Two-step staff gate: pick name, then enter 4-digit PIN.
 * @param {{ staffList: object[], roleFilter?: string|null, onVerified?: (staff: object) => void, children: React.ReactNode }} props
 */
export default function StaffLoginGate({
  staffList,
  roleFilter = null,
  onVerified,
  children,
}) {
  const [step, setStep] = useState('pick')
  const [picked, setPicked] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (isStaffVerified()) {
    return children
  }

  const filtered = staffList.filter((s) => {
    if (!roleFilter) return true
    return canManageOrders(s.role)
  })

  function handlePick(member) {
    setPicked(member)
    setPin('')
    setError('')
    setStep('pin')
  }

  function handleBack() {
    setStep('pick')
    setPicked(null)
    setPin('')
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!picked || busy) return
    if (!/^\d{4}$/.test(pin)) {
      setError('Enter a 4-digit PIN.')
      return
    }
    setBusy(true)
    setError('')
    const result = await verifyStaff(picked.id, pin)
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Invalid PIN.')
      return
    }
    if (roleFilter && !canManageOrders(result.staff?.role)) {
      clearStaffSession()
      setError('Manager access only — this account cannot open this view.')
      setStep('pick')
      setPicked(null)
      setPin('')
      return
    }
    onVerified?.(result.staff)
  }

  if (step === 'pin' && picked) {
    return (
      <GateShell title="Enter PIN" subtitle={`Signing in as ${picked.full_name}`}>
        <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span style={{ fontSize: 13, fontWeight: 700, color: C.brown2 }}>4-digit PIN</span>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="rounded-2xl px-4 py-4 text-center font-bold tracking-[0.35em]"
              style={{
                fontSize: 22,
                border: `2px solid ${C.border}`,
                background: '#fff',
                fontFamily: FONT_BODY,
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'pin-error' : undefined}
              autoFocus
            />
          </label>
          {error && (
            <p id="pin-error" role="alert" style={{ color: C.red, fontWeight: 600, fontSize: 14, margin: 0 }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || pin.length !== 4}
            className="rounded-2xl py-4 font-bold disabled:opacity-60"
            style={{ background: C.red, color: C.cream, fontSize: 17 }}
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={handleBack}
            className="rounded-xl py-2 font-semibold"
            style={{ color: C.brown2, fontSize: 14 }}
          >
            ← Back
          </button>
        </form>
      </GateShell>
    )
  }

  return (
    <GateShell
      title={roleFilter ? 'Manager sign-in' : "Who's on shift?"}
      subtitle={
        roleFilter
          ? 'Manager or admin PIN required.'
          : 'Pick your name, then enter your PIN.'
      }
    >
      {filtered.length === 0 ? (
        <p style={{ color: C.brown2, fontSize: 15 }}>No staff available for this view.</p>
      ) : (
        <div className="grid w-full max-w-md gap-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handlePick(s)}
              className="rounded-2xl px-6 py-5 text-left font-bold transition-transform active:scale-[0.98]"
              style={{
                background: '#fff',
                border: `2px solid ${C.border}`,
                boxShadow: `0 4px 0 ${C.border}`,
                fontSize: 18,
                color: C.ink,
              }}
            >
              {s.full_name}
              <span
                className="ml-2 rounded-full px-2 py-0.5 font-normal uppercase"
                style={{ fontSize: 11, background: C.goldBg, color: C.brown2, letterSpacing: '0.06em' }}
              >
                {s.role}
              </span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4" style={{ color: C.red, fontWeight: 600, fontSize: 14 }}>
          {error}
        </p>
      )}
    </GateShell>
  )
}

function GateShell({ title, subtitle, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-16">
      <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 32, color: C.ink, marginBottom: 8 }}>{title}</h1>
      <p style={{ color: C.brown2, marginBottom: 32, fontSize: 15, textAlign: 'center' }}>{subtitle}</p>
      {children}
    </div>
  )
}
