import { useEffect, useRef, useState } from 'react'
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

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Close chat"
          onClick={onClose}
        />
        <motion.aside
          className="relative flex h-full w-full max-w-lg flex-col shadow-2xl"
          style={{ background: '#faf3e6' }}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        >
          <header
            className="flex items-center justify-between px-5 py-4"
            style={{ background: C.ink, color: C.cream }}
          >
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22 }}>Ask COO</div>
              <div style={{ fontSize: 11, color: '#c8a883' }}>Natural language → SQL → answer</div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={newThread} className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: '#3a2418', color: '#e8c99a' }}>
                New
              </button>
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-bold" style={{ background: C.red }}>
                Close
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && !busy && (
              <div className="mb-4">
                <p style={{ fontSize: 14, color: C.brown2, marginBottom: 12 }}>
                  Ask about prep times, cancellations, tables, or sales.
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => submit(q)}
                      className="rounded-full px-3 py-1.5 text-left"
                      style={{ background: '#fff', border: `1px solid ${C.border}`, fontSize: 12, color: C.brown }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[92%] rounded-2xl px-4 py-3 ${m.role === 'user' ? 'ml-auto' : ''}`}
                  style={
                    m.role === 'user'
                      ? { background: C.red, color: C.cream }
                      : { background: '#fff', border: `1px solid ${C.border}`, color: C.ink }
                  }
                >
                  <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  {m.sql && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setShowSql((s) => ({ ...s, [i]: !s[i] }))}
                        className="text-xs font-bold"
                        style={{ color: C.brown2 }}
                      >
                        {showSql[i] ? 'Hide SQL' : 'Show SQL'}
                      </button>
                      {m.rows?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowData((s) => ({ ...s, [i]: !s[i] }))}
                          className="text-xs font-bold"
                          style={{ color: C.brown2 }}
                        >
                          {showData[i] ? 'Hide raw data' : 'Show raw data'}
                        </button>
                      )}
                      {showSql[i] && (
                        <pre
                          className="mt-2 w-full overflow-x-auto rounded-lg p-2 text-xs"
                          style={{ background: C.cream, fontFamily: FONT_MONO }}
                        >
                          {m.sql}
                        </pre>
                      )}
                    </div>
                  )}
                  {showData[i] && m.rows?.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs" style={{ fontFamily: FONT_MONO }}>
                        <thead>
                          <tr>
                            {Object.keys(m.rows[0]).map((k) => (
                              <th key={k} className="px-2 py-1 text-left" style={{ color: C.brown3 }}>{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {m.rows.slice(0, 10).map((row, ri) => (
                            <tr key={ri}>
                              {Object.values(row).map((v, vi) => (
                                <td key={vi} className="px-2 py-1">{String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
              {busy && <p style={{ color: C.brown2, fontSize: 13 }}>COO is thinking…</p>}
            </div>
            <div ref={bottomRef} />
          </div>

          {error && (
            <p role="alert" className="px-4 pb-2" style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>
              {error}
            </p>
          )}

          <div className="border-t p-4" style={{ borderColor: C.border }}>
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                rows={2}
                placeholder="Ask about your restaurant data…"
                className="flex-1 resize-none rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.border}`, fontSize: 14 }}
              />
              <button
                type="button"
                disabled={busy || !input.trim()}
                onClick={() => submit()}
                className="self-end rounded-xl px-4 py-2 font-bold disabled:opacity-50"
                style={{ background: C.red, color: C.cream }}
              >
                Send
              </button>
            </div>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  )
}

/** Floating action button for Admin analytics */
export function CooChatFab({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2 rounded-full px-5 font-bold shadow-lg"
      style={{ background: C.red, color: C.cream, boxShadow: '0 8px 24px rgba(197,52,28,0.35)' }}
      aria-label="Ask COO"
    >
      <span style={{ fontSize: 20 }}>🤖</span>
      Ask COO
    </button>
  )
}
