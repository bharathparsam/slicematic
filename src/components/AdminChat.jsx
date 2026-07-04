import { useEffect, useRef, useState } from 'react'
import { sendChatMessage } from '@/lib/chatStore'
import { C, FONT_DISPLAY } from '@/components/order/theme'

const STARTERS = [
  'What were net sales in the last 7 days?',
  'Which pizza sold the most?',
  'What is our busiest hour?',
  'Cash vs UPI split this week?',
]

export default function AdminChat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [model, setModel] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function submit(text) {
    const question = (text ?? input).trim()
    if (!question || busy) return

    setInput('')
    setError('')
    setBusy(true)

    const userTurn = { role: 'user', content: question }
    const history = messages.map(({ role, content }) => ({ role, content }))
    setMessages((m) => [...m, userTurn])

    try {
      const res = await sendChatMessage(question, history)
      setModel(res.model || '')
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }])
    } catch (err) {
      setError(err.message || 'Could not get a reply.')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <main
      className="flex min-h-0 min-w-0 flex-1 flex-col px-6 py-7 sm:px-8"
      style={{ animation: 'floatUp .35s ease both' }}
    >
      <div className="mb-5">
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 34, margin: 0, color: C.ink }}>
          Ask COO
        </h1>
        <p className="mt-1.5" style={{ fontSize: 13.5, color: C.brown2, fontWeight: 600 }}>
          Natural-language answers from your live order analytics · powered by OpenRouter
        </p>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px]"
        style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: `0 4px 0 ${C.border}` }}
      >
        <div className="flex-1 overflow-y-auto p-5" aria-live="polite">
          {messages.length === 0 && !busy ? (
            <p className="py-4" style={{ fontSize: 15, color: C.brown }}>
              Ask anything about sales, pizzas, payments, or peak hours — or tap a common query below.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((m, i) => (
                <Bubble key={i} role={m.role} content={m.content} />
              ))}
              {busy ? <Bubble role="assistant" content="Checking the numbers…" pending /> : null}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div
          className="shrink-0 border-t"
          style={{ borderColor: C.border, background: C.cream }}
        >
          <QuickQueries onPick={submit} disabled={busy} />

          {error && (
            <p role="alert" className="px-4 pb-1" style={{ fontSize: 13.5, color: C.red, fontWeight: 600 }}>
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 p-4 pt-2 sm:flex-row sm:items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Ask about sales, top pizzas, peak hours…"
            disabled={busy}
            className="min-h-[52px] flex-1 resize-none rounded-xl px-4 py-3 disabled:opacity-60"
            style={{
              border: `1.5px solid ${C.border2}`,
              background: '#fff',
              fontSize: 15,
              color: C.ink,
            }}
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={busy || !input.trim()}
            className="rounded-xl px-5 py-3 font-bold disabled:opacity-50 sm:min-w-[7rem]"
            style={{
              background: C.red,
              color: C.cream,
              fontSize: 15,
              boxShadow: '0 10px 22px rgba(197,52,28,0.28)',
            }}
          >
            {busy ? 'Thinking…' : 'Send'}
          </button>
          </div>
        </div>
      </div>

      {model && (
        <p className="mt-3 text-center" style={{ fontSize: 11.5, color: C.brown3 }}>
          Model: {model}
        </p>
      )}
    </main>
  )
}

function QuickQueries({ onPick, disabled }) {
  return (
    <div className="px-4 pb-2 pt-3">
      <div
        className="mb-2 uppercase"
        style={{ fontSize: 10, letterSpacing: '0.14em', color: C.brown3, fontWeight: 700 }}
      >
        Common queries
      </div>
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            disabled={disabled}
            className="rounded-full px-3 py-1.5 text-left font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
            style={{
              background: '#fff',
              color: C.gold,
              border: `1px solid ${C.goldBorder}`,
              fontSize: 12.5,
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function Bubble({ role, content, pending = false }) {
  const isUser = role === 'user'
  return (
    <div className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
      <div
        className="max-w-[85%] rounded-2xl px-4 py-3"
        style={
          isUser
            ? { background: C.red, color: C.cream, fontSize: 14.5, lineHeight: 1.5 }
            : {
                background: '#fbf7ee',
                border: `1px solid ${C.border}`,
                color: C.ink,
                fontSize: 14.5,
                lineHeight: 1.55,
                opacity: pending ? 0.75 : 1,
              }
        }
      >
        {!isUser && (
          <div
            className="mb-1 uppercase"
            style={{ fontSize: 10, letterSpacing: '0.12em', color: C.gold, fontWeight: 700 }}
          >
            COO
          </div>
        )}
        <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
      </div>
    </div>
  )
}
