import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  sendChatMessage,
  getStoredThreadId,
  setStoredThreadId,
} from '@/lib/cooStore'
import { C, FONT_DISPLAY, FONT_MONO } from '@/components/order/theme'

const STARTERS = [
  'Which hour was busiest last Saturday?',
  'How long did our slowest pizza take to prep?',
  'Which table had the longest dwell yesterday?',
  'How many orders cancelled while still preparing?',
]

export default function CooChat({ open, onClose, briefingContext }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [threadId, setThreadId] = useState(getStoredThreadId())
  const [showSql, setShowSql] = useState({})
  const [showData, setShowData] = useState({})
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open && briefingContext?.briefingId && !threadId) {
      setMessages([{
        role: 'assistant',
        content: 'I have today\'s COO brief loaded. What would you like to dig into?',
      }])
    }
  }, [open, briefingContext, threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function submit(text) {
    const question = (text ?? input).trim()
    if (!question || busy) return
    setInput('')
    setError('')
    setBusy(true)
    setMessages((m) => [...m, { role: 'user', content: question }])

    try {
      const res = await sendChatMessage({
        message: question,
        threadId,
        briefingId: briefingContext?.briefingId,
      })
      setThreadId(res.thread_id)
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: res.reply,
          sql: res.sql,
          rows: res.rows_preview,
          rowCount: res.row_count,
        },
      ])
    } catch (err) {
      setError(err.message || 'Couldn\'t reach COO right now.')
    } finally {
      setBusy(false)
    }
  }

  function newThread() {
    setStoredThreadId(null)
    setThreadId(null)
    setMessages([])
    setShowSql({})
    setShowData({})
  }

  if (!open) return null

  const empty = messages.length === 0 && !busy

  return createPortal(
    <AnimatePresence>
      <motion.aside
        key="coo-widget"
        role="dialog"
        aria-label="Ask COO"
        className="fixed z-50 flex flex-col overflow-hidden rounded-2xl"
        style={{
          background: '#faf3e6',
          border: '1px solid #eaddc5',
          boxShadow: '0 24px 60px rgba(35,22,16,.34)',
          right: 16,
          bottom: 16,
          width: 'min(384px, calc(100vw - 24px))',
          height: 'min(600px, calc(100vh - 96px))',
          transformOrigin: 'bottom right',
        }}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      >
          {/* header */}
          <header
            className="flex items-center justify-between px-[22px] py-[18px]"
            style={{ background: C.ink, color: C.cream }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px]"
                style={{ background: C.red, fontSize: 17 }}
              >
                ✦
              </span>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19 }}>Ask COO</div>
                <div style={{ fontSize: 11, color: '#c8a883', fontWeight: 600 }}>Your data, in plain English</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={newThread}
                className="rounded-[9px] px-[13px] py-2 font-bold"
                style={{ border: '1px solid #4a3122', background: 'transparent', color: '#e9d3b6', fontSize: 12.5 }}
              >
                New
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] font-bold leading-none"
                style={{ background: '#3a2418', color: '#e9d3b6', fontSize: 15 }}
              >
                ✕
              </button>
            </div>
          </header>

          {/* messages */}
          <div className="flex-1 overflow-y-auto px-5 pb-2 pt-5">
            {empty && (
              <>
                <div className="pb-[22px] pt-[14px] text-center">
                  <div
                    className="mx-auto mb-[14px] flex h-14 w-14 items-center justify-center rounded-[16px]"
                    style={{ background: C.goldBg, fontSize: 26 }}
                  >
                    ✦
                  </div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: C.ink }}>Ask about today&apos;s service</div>
                  <div
                    className="mx-auto mt-1.5"
                    style={{ fontSize: 13, color: C.brown2, fontWeight: 600, lineHeight: 1.5, maxWidth: 280 }}
                  >
                    Prep times, cancellations, tables, sales — I read the live order data and answer.
                  </div>
                </div>
                <div className="flex flex-col gap-[9px]">
                  {STARTERS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => submit(q)}
                      className="flex items-center gap-[11px] rounded-[13px] px-[15px] py-[13px] text-left transition-colors hover:brightness-95"
                      style={{ border: '1.5px solid #ecdcc0', background: '#fff', color: C.ink, fontSize: 13.5, fontWeight: 600 }}
                    >
                      <span style={{ color: C.red, fontSize: 15 }}>→</span>
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="flex flex-col gap-3.5">
              {messages.map((m, i) => {
                if (m.role === 'user') {
                  return (
                    <div key={i} className="flex justify-end">
                      <div
                        className="max-w-[82%]"
                        style={{ background: C.red, color: C.cream, fontSize: 14, lineHeight: 1.5, padding: '11px 15px', borderRadius: '16px 16px 4px 16px', whiteSpace: 'pre-wrap' }}
                      >
                        {m.content}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={i} className="flex flex-col" style={{ maxWidth: '88%' }}>
                    {m.sql && showSql[i] && (
                      <pre
                        className="mb-2 overflow-x-auto whitespace-pre-wrap"
                        style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#a5601f', background: C.goldBg, border: `1px solid ${C.goldBorder}`, borderRadius: 10, padding: '8px 11px', lineHeight: 1.5 }}
                      >
                        {m.sql}
                      </pre>
                    )}
                    {showData[i] && m.rows?.length > 0 && (
                      <div className="mb-2 overflow-x-auto rounded-[10px]" style={{ border: `1px solid ${C.border}` }}>
                        <table className="w-full" style={{ fontFamily: FONT_MONO, fontSize: 11 }}>
                          <thead>
                            <tr>
                              {Object.keys(m.rows[0]).map((k) => (
                                <th key={k} className="px-2 py-1 text-left" style={{ color: C.brown3, background: C.cream }}>{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {m.rows.slice(0, 10).map((row, ri) => (
                              <tr key={ri}>
                                {Object.values(row).map((v, vi) => (
                                  <td key={vi} className="px-2 py-1" style={{ borderTop: `1px solid ${C.border}` }}>{String(v)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div
                      style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.ink, fontSize: 14, lineHeight: 1.55, padding: '12px 15px', borderRadius: '16px 16px 16px 4px', whiteSpace: 'pre-wrap' }}
                    >
                      {m.content}
                    </div>
                    {(m.sql || m.rows?.length > 0) && (
                      <div className="mt-1.5 flex gap-3 pl-1">
                        {m.sql && (
                          <button
                            type="button"
                            onClick={() => setShowSql((s) => ({ ...s, [i]: !s[i] }))}
                            className="font-bold"
                            style={{ fontSize: 11.5, color: C.brown2 }}
                          >
                            {showSql[i] ? 'Hide SQL' : 'Show SQL'}
                          </button>
                        )}
                        {m.rows?.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowData((s) => ({ ...s, [i]: !s[i] }))}
                            className="font-bold"
                            style={{ fontSize: 11.5, color: C.brown2 }}
                          >
                            {showData[i] ? 'Hide raw data' : 'Show raw data'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {busy && (
                <div className="flex">
                  <div className="flex gap-[5px]" style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '16px 16px 16px 4px', padding: '14px 16px' }}>
                    {[0, 0.2, 0.4].map((d) => (
                      <motion.span
                        key={d}
                        style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, display: 'inline-block' }}
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: d }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div ref={bottomRef} />
          </div>

          {error && (
            <p role="alert" className="px-5 pb-2" style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>
              {error}
            </p>
          )}

          {/* input */}
          <div className="border-t px-[18px] pb-[16px] pt-3.5" style={{ borderColor: '#eaddc5', background: '#faf3e6' }}>
            <div className="flex items-end gap-[9px]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="Ask about your restaurant data…"
                className="flex-1 rounded-[13px] px-[15px] py-[13px]"
                style={{ border: '1.5px solid #e3d4bc', background: '#fff', fontSize: 14, color: C.ink }}
              />
              <button
                type="button"
                disabled={busy || !input.trim()}
                onClick={() => submit()}
                aria-label="Send"
                className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] font-extrabold leading-none"
                style={
                  input.trim() && !busy
                    ? { background: C.red, color: C.cream, fontSize: 19, boxShadow: '0 6px 16px rgba(197,52,28,.3)' }
                    : { background: '#e6d8c0', color: '#b3a184', fontSize: 19 }
                }
              >
                ↑
              </button>
            </div>
            <div className="mt-[9px] text-center" style={{ fontSize: 11, color: '#a0876a', fontWeight: 600 }}>
              Natural language → SQL → answer · reads live order data
            </div>
          </div>
      </motion.aside>
    </AnimatePresence>,
    document.body
  )
}

/** Floating action button (kept for callers that still mount a FAB). */
export function CooChatFab({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2 rounded-full px-5 font-bold shadow-lg"
      style={{ background: C.red, color: C.cream, boxShadow: '0 8px 24px rgba(197,52,28,0.35)' }}
      aria-label="Ask COO"
    >
      <span style={{ fontSize: 18 }}>✦</span>
      Ask COO
    </button>
  )
}
