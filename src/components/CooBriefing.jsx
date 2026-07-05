import { useEffect, useState } from 'react'
import { getLatestBriefing, generateBriefing } from '@/lib/cooStore'
import { FONT_DISPLAY } from '@/components/order/theme'

// Section accents matched to the redesign (went-well / didn't / to-do).
const SECTION_STYLES = [
  { icon: '✅', color: '#6ec778' },
  { icon: '⚠️', color: '#f0b06a' },
  { icon: '🎯', color: '#7fb0f0' },
]

export default function CooBriefing({ onAskFollowUp }) {
  const [briefing, setBriefing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setBriefing(await getLatestBriefing())
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
      setBriefing(await generateBriefing())
    } catch (err) {
      setError(err.message || 'Could not generate brief.')
    } finally {
      setGenerating(false)
    }
  }

  const sections = parseSections(briefing?.summary_text)

  return (
    <div
      className="mb-[18px] rounded-[20px] px-6 py-[22px]"
      style={{
        background: 'linear-gradient(150deg,#2c1a12,#231610)',
        color: '#fbf5ea',
        boxShadow: '0 12px 30px rgba(35,22,16,.22)',
      }}
    >
      {/* header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-[11px]">
          <span
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px]"
            style={{ background: '#c5341c', fontSize: 16 }}
          >
            ✦
          </span>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21 }}>Today&apos;s COO Brief</div>
            <div style={{ fontSize: 11.5, color: '#c8a883', fontWeight: 600 }}>
              {briefing?.business_date
                ? `Business date · ${briefing.business_date} · ${briefing.model ? 'AI-generated' : 'auto-generated'}`
                : 'Ops-first daily summary'}
            </div>
          </div>
        </div>
        <div className="flex gap-[9px]">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-[10px] px-4 py-[9px] font-bold transition-opacity disabled:opacity-60"
            style={{ border: '1px solid #4a3122', background: 'transparent', color: '#e9d3b6', fontSize: 13 }}
          >
            {generating ? 'Generating…' : '↻ Regenerate'}
          </button>
          {onAskFollowUp && briefing && (
            <button
              type="button"
              onClick={() => onAskFollowUp({ briefingId: briefing.id, kpiSnapshot: briefing.kpi_snapshot })}
              className="rounded-[10px] px-4 py-[9px] font-bold"
              style={{ background: '#c5341c', color: '#fbf5ea', fontSize: 13 }}
            >
              Ask follow-up →
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: '#f0b06a', fontSize: 13.5, fontWeight: 600 }}>
          {error}
        </p>
      )}

      {loading ? (
        <p style={{ color: '#c8a883', fontSize: 14 }}>Loading brief…</p>
      ) : !briefing ? (
        <div className="flex flex-wrap items-center gap-3">
          <p style={{ color: '#c8a883', fontSize: 14 }}>No brief generated for today yet.</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-[10px] px-4 py-2 font-bold disabled:opacity-60"
            style={{ background: '#c5341c', color: '#fbf5ea', fontSize: 13 }}
          >
            {generating ? 'Generating…' : 'Generate COO brief →'}
          </button>
        </div>
      ) : (
        <div className="grid gap-[14px] md:grid-cols-3">
          {sections.map((s, i) => {
            const st = SECTION_STYLES[i] ?? SECTION_STYLES[SECTION_STYLES.length - 1]
            return (
              <div
                key={s.title + i}
                className="rounded-[14px] px-4 py-[15px]"
                style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}
              >
                <div className="mb-[10px] flex items-center gap-2">
                  <span style={{ fontSize: 14 }}>{st.icon}</span>
                  <span
                    className="uppercase"
                    style={{ fontSize: 11.5, letterSpacing: '0.06em', fontWeight: 700, color: st.color }}
                  >
                    {s.title}
                  </span>
                </div>
                {s.points.map((p, j) => (
                  <div
                    key={j}
                    className="mb-[7px] flex gap-2"
                    style={{ fontSize: 13, lineHeight: 1.5, color: '#e6d9c6' }}
                  >
                    <span style={{ color: st.color, flex: 'none' }}>•</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Split the LLM brief into up to 3 sections with bullet points. Handles both
 * "## Heading" markdown and plain paragraphs; each non-empty line (or - / • item)
 * becomes a bullet.
 */
function parseSections(text) {
  if (!text) return []
  const DEFAULT_TITLES = ['What went well', "What didn't", 'What to do']
  const hasHeadings = /^#{1,3}\s+/m.test(text) || /^\*\*.+\*\*/m.test(text)

  let blocks
  if (hasHeadings) {
    blocks = text
      .split(/^#{1,3}\s+|\n(?=\*\*)/m)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((block) => {
        const nl = block.indexOf('\n')
        const rawTitle = (nl === -1 ? block : block.slice(0, nl)).replace(/\*\*/g, '').replace(/:$/, '').trim()
        const body = nl === -1 ? '' : block.slice(nl + 1).trim()
        return { title: rawTitle, body }
      })
  } else {
    // No headings: split into up to 3 paragraphs and label them.
    blocks = text
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((body, i) => ({ title: DEFAULT_TITLES[i] ?? 'Notes', body }))
  }

  return blocks.slice(0, 3).map((b) => ({ title: b.title, points: toPoints(b.body) }))
}

function toPoints(body) {
  if (!body) return []
  const lines = body
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)
  if (lines.length) return lines
  // Single blob → split on sentence boundaries so it still reads as bullets.
  return body
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
