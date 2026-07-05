import { useEffect, useState } from 'react'
import { getLatestBriefing, generateBriefing } from '@/lib/cooStore'
import { C, FONT_DISPLAY } from '@/components/order/theme'

export default function CooBriefing({ onAskFollowUp }) {
  const [briefing, setBriefing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const row = await getLatestBriefing()
      setBriefing(row)
    } catch {
      setError('Could not load COO brief.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    try {
      const row = await generateBriefing()
      setBriefing(row)
    } catch (err) {
      setError(err.message || 'Could not generate brief.')
    } finally {
      setGenerating(false)
    }
  }

  const sections = parseSections(briefing?.summary_text)

  return (
    <div
      className="mb-6 rounded-[20px] p-6"
      style={{ background: 'linear-gradient(145deg,#fff 0%,#faf3e6 100%)', border: `1px solid ${C.border}`, boxShadow: `0 4px 0 ${C.border}` }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, margin: 0, color: C.ink }}>
            Today&apos;s COO Brief
          </h2>
          <p style={{ fontSize: 13, color: C.brown2, fontWeight: 600, marginTop: 4 }}>
            {briefing?.business_date ? `Business date · ${briefing.business_date}` : 'Ops-first daily summary'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-xl px-4 py-2 font-bold disabled:opacity-60"
            style={{ border: `1.5px solid ${C.border2}`, background: '#fff', fontSize: 13 }}
          >
            {generating ? 'Generating…' : 'Regenerate'}
          </button>
          {onAskFollowUp && briefing && (
            <button
              type="button"
              onClick={() => onAskFollowUp({ briefingId: briefing.id, kpiSnapshot: briefing.kpi_snapshot })}
              className="rounded-xl px-4 py-2 font-bold"
              style={{ background: C.red, color: C.cream, fontSize: 13 }}
            >
              Ask follow-up
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: C.red, fontSize: 14, fontWeight: 600 }}>{error}</p>
      )}

      {loading ? (
        <p style={{ color: C.brown2 }}>Loading brief…</p>
      ) : !briefing ? (
        <div>
          <p style={{ color: C.brown2, marginBottom: 12 }}>No brief yet for today.</p>
          <button type="button" onClick={handleGenerate} className="font-bold" style={{ color: C.red }}>
            Generate COO brief →
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {sections.map((s) => (
            <div key={s.title} className="rounded-xl p-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
              <div className="mb-2 font-bold uppercase" style={{ fontSize: 11, letterSpacing: '0.1em', color: C.brown3 }}>
                {s.title}
              </div>
              <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{s.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function parseSections(text) {
  if (!text) return []
  const parts = text.split(/^##\s+/m).filter(Boolean)
  if (parts.length <= 1 && !text.includes('##')) {
    return [{ title: 'Summary', body: text.trim() }]
  }
  return parts.map((block) => {
    const nl = block.indexOf('\n')
    const title = nl === -1 ? block.trim() : block.slice(0, nl).trim()
    const body = nl === -1 ? '' : block.slice(nl + 1).trim()
    return { title, body }
  })
}
