// tablesLoader.js
// Loads the dine-in table layout from /config/tables.json at runtime — the same
// data-not-code seam as the menu .txt and tax_config.json. Counter staff can
// re-number the floor by editing one file. Parsing is defensive: a missing or
// broken config falls back to DEFAULT_TABLES so the app always has tables.
//
// Two supported shapes (either works):
//   { "count": 12, "label": "Table" }            -> Table 1 … Table 12
//   { "tables": ["A1", "A2", "Patio 1"] }         -> explicit names, verbatim

export const TABLES_FILE = '/config/tables.json'

/** Safe default — used when the config file is missing or unusable. */
export const DEFAULT_TABLES = Object.freeze({
  label: 'Table',
  tables: Object.freeze(
    Array.from({ length: 12 }, (_, i) => `Table ${i + 1}`)
  ),
})

const MAX_TABLES = 60 // guardrail so a bad `count` can't render thousands of cells

/**
 * Validate + normalise a raw config object into a safe { label, tables } shape.
 * Pure: raw in, config out. Never throws; warns on each fallback.
 * @param {any} raw
 * @returns {{ label: string, tables: string[] }}
 */
export function parseTablesConfig(raw) {
  const d = DEFAULT_TABLES
  if (!raw || typeof raw !== 'object') {
    console.warn('[tablesLoader] config missing or not an object — using defaults')
    return { label: d.label, tables: [...d.tables] }
  }

  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : d.label

  // Explicit list of names wins when present and valid.
  if (Array.isArray(raw.tables)) {
    const tables = raw.tables
      .map((t) => (t == null ? '' : String(t).trim()))
      .filter((t) => t !== '')
      .slice(0, MAX_TABLES)
    if (tables.length > 0) return { label, tables }
    console.warn('[tablesLoader] "tables" array had no usable names — using defaults')
    return { label, tables: [...d.tables] }
  }

  // Otherwise derive from a numeric count.
  const count = raw.count
  if (Number.isInteger(count) && count > 0) {
    const n = Math.min(count, MAX_TABLES)
    if (count > MAX_TABLES) {
      console.warn(`[tablesLoader] count ${count} exceeds cap — clamped to ${MAX_TABLES}`)
    }
    const tables = Array.from({ length: n }, (_, i) => `${label} ${i + 1}`)
    return { label, tables }
  }

  console.warn(`[tablesLoader] invalid count "${raw.count}" and no tables list — using defaults`)
  return { label, tables: [...d.tables] }
}

/**
 * Fetch + parse the tables config. Like the tax config (and unlike the menu), a
 * missing/broken file is non-fatal: we log and fall back to DEFAULT_TABLES.
 * @returns {Promise<{ label: string, tables: string[] }>}
 */
export async function loadTables() {
  try {
    const res = await fetch(TABLES_FILE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json()
    return parseTablesConfig(raw)
  } catch (err) {
    console.warn(
      `[tablesLoader] could not load ${TABLES_FILE} (${err.message}) — using defaults`
    )
    return { label: DEFAULT_TABLES.label, tables: [...DEFAULT_TABLES.tables] }
  }
}
