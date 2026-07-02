// menuLoader.js
// Fetches and defensively parses the three menu .txt files at runtime.
// Format per line: `ID;Name;Price`. No menu item is ever hardcoded here —
// whatever the .txt files contain is what the app shows.

/**
 * Parse the raw text of one menu file into an array of clean item objects.
 * Pure function: given text, returns items. No fetch, no DOM.
 *
 * Rules (defensive):
 *  - split into lines, skip blank / whitespace-only lines
 *  - each valid line must have exactly 3 semicolon-separated fields
 *  - trim every field
 *  - id and name must be non-empty
 *  - price must parse as a finite, positive number
 *  - any malformed line is skipped with a console.warn — never throws
 *
 * @param {string} text - raw file contents
 * @param {string} [source] - filename, for clearer warnings
 * @returns {Array<{id: string, name: string, price: number}>}
 */
export function parseMenuText(text, source = 'menu') {
  if (typeof text !== 'string') return []

  const items = []
  const lines = text.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    if (rawLine.trim() === '') continue // skip blank lines silently

    const fields = rawLine.split(';')
    if (fields.length !== 3) {
      console.warn(
        `[menuLoader] ${source} line ${i + 1}: expected 3 fields, got ${fields.length} — skipped: "${rawLine}"`
      )
      continue
    }

    const id = fields[0].trim()
    const name = fields[1].trim()
    const priceStr = fields[2].trim()

    if (id === '' || name === '') {
      console.warn(
        `[menuLoader] ${source} line ${i + 1}: empty id or name — skipped: "${rawLine}"`
      )
      continue
    }

    // Number() rejects things like "12abc" (-> NaN), unlike parseFloat.
    const price = Number(priceStr)
    if (!Number.isFinite(price) || price <= 0) {
      console.warn(
        `[menuLoader] ${source} line ${i + 1}: invalid price "${priceStr}" — skipped: "${rawLine}"`
      )
      continue
    }

    items.push({ id, name, price })
  }

  return items
}

/**
 * Fetch + parse a single menu file. Throws on network/404/empty so the caller
 * can surface a clear error state.
 * @param {string} path - e.g. '/data/Types_of_Base.txt'
 * @returns {Promise<Array<{id,name,price}>>}
 */
export async function loadMenuFile(path) {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (HTTP ${res.status})`)
  }
  const text = await res.text()
  const items = parseMenuText(text, path)
  if (items.length === 0) {
    throw new Error(`No valid menu items found in ${path}`)
  }
  return items
}

export const MENU_FILES = {
  bases: '/data/Types_of_Base.txt',
  pizzas: '/data/Types_of_Pizza.txt',
  toppings: '/data/Types_of_Toppings.txt',
}

/**
 * Load all three menu files. Returns { bases, pizzas, toppings } on success.
 * Aggregates failures so the UI can list exactly which file(s) broke.
 * @returns {Promise<{bases, pizzas, toppings}>}
 */
export async function loadAllMenus() {
  const entries = Object.entries(MENU_FILES)
  const results = await Promise.allSettled(
    entries.map(([, path]) => loadMenuFile(path))
  )

  const menu = {}
  const errors = []
  results.forEach((result, idx) => {
    const [key, path] = entries[idx]
    if (result.status === 'fulfilled') {
      menu[key] = result.value
    } else {
      errors.push(`${path}: ${result.reason.message}`)
    }
  })

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
  return menu
}
