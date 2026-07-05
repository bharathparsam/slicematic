import { useEffect, useState } from 'react'
import ManagerOrdersPanel from '@/components/ManagerOrdersPanel'
import StaffLoginGate from '@/components/StaffLoginGate'
import ViewNav from '@/components/ViewNav'
import {
  listStaff,
  getSelectedStaff,
  isStaffVerified,
  clearStaffSession,
} from '@/lib/staffStore'
import { C, FONT_DISPLAY, FONT_BODY } from '@/components/order/theme'

export default function ManagerBoard({ onOrder, onKitchen, onAdmin }) {
  const [staffList, setStaffList] = useState([])
  const [staff, setStaff] = useState(() =>
    isStaffVerified() ? getSelectedStaff() : null,
  )

  useEffect(() => {
    listStaff().then(setStaffList)
  }, [])

  function handleChangeStaff() {
    clearStaffSession()
    setStaff(null)
  }

  const verified = isStaffVerified() && staff

  return (
    <div className="min-h-screen w-full" style={{ background: '#efe4d0', fontFamily: FONT_BODY }}>
      <div
        className="mx-auto min-h-screen max-w-[1280px]"
        style={{ background: '#faf3e6', boxShadow: '0 0 80px rgba(120,70,20,0.1)' }}
      >
        <header
          className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-4 sm:px-8"
          style={{ background: C.ink, color: C.cream }}
        >
          <div className="min-w-0">
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22 }}>Manager</div>
            <div style={{ fontSize: 11, color: '#c8a883', fontWeight: 600, letterSpacing: '0.12em' }}>
              SLICEMATIC · MANAGER
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {verified && (
              <button
                type="button"
                onClick={handleChangeStaff}
                className="max-w-[140px] truncate rounded-full px-3 py-1.5 font-semibold sm:max-w-none"
                style={{ background: '#3a2418', color: '#e8c99a', fontSize: 12 }}
                title={staff.full_name}
              >
                {staff.full_name} · switch
              </button>
            )}
            <ViewNav
              active="manager"
              variant="dark"
              onOrder={onOrder}
              onKitchen={onKitchen}
              onAdmin={onAdmin}
            />
          </div>
        </header>
        <StaffLoginGate
          staffList={staffList}
          roleFilter="manager"
          onVerified={setStaff}
        >
          <ManagerOrdersPanel />
        </StaffLoginGate>
      </div>
    </div>
  )
}
