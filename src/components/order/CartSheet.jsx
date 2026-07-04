import BottomSheet, { SheetFooter, SheetHeader } from './BottomSheet'
import OrderCartPanel from './OrderCartPanel'
import { formatCurrency } from '@/lib/billing'
import { C, FONT_DISPLAY, shortName } from './theme'

/**
 * Mobile cart / checkout sheet — wraps OrderCartPanel in a bottom sheet.
 */
export default function CartSheet({ open, onClose, bill, onReview, ...panelProps }) {
  const { table, label } = panelProps
  const hasLines = bill.lines.length > 0

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="cart-title" maxHeight="94vh">
      <SheetHeader onClose={onClose}>
        <h2 id="cart-title" style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 26, margin: 0 }}>
          Your order{' '}
          <span style={{ fontSize: 15, color: C.brown2, fontFamily: 'inherit', fontWeight: 600 }}>
            · {label} {shortName(table, label)}
          </span>
        </h2>
      </SheetHeader>
      <OrderCartPanel {...panelProps} bill={bill} compact showFooter={false} />
      {hasLines && (
        <SheetFooter>
          <button
            type="button"
            onClick={onReview}
            className="w-full rounded-[15px] py-4 font-bold transition-transform active:scale-[0.99]"
            style={{
              background: C.red,
              color: C.cream,
              fontSize: 16,
              boxShadow: '0 12px 26px rgba(197,52,28,0.3)',
            }}
          >
            Review · {formatCurrency(bill.total)}
          </button>
        </SheetFooter>
      )}
    </BottomSheet>
  )
}
