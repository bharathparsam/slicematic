// Shared warm "SliceMatic" palette + fonts for the redesigned customer-facing
// screens (landing + order flow). Imported from data, not re-declared per file.
// Fonts load in index.html (Google Fonts) and degrade to system serif/sans/mono.

export const FONT_DISPLAY = "'DM Serif Display', Georgia, 'Times New Roman', serif"
export const FONT_BODY = "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif"
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace"

export const C = {
  cream: '#fbf5ea',
  ink: '#231610',
  red: '#c5341c',
  brown: '#6b5544',
  brown2: '#8a7159',
  brown3: '#a58a63',
  gold: '#a5601f',
  goldBg: '#fdeccb',
  goldBorder: '#f2d79a',
  green: '#3f8f4b',
  greenDark: '#2f7a3b',
  greenBg: '#e7f2e0',
  amber: '#d98a2b',
  border: '#f0e2cc',
  border2: '#e3d4bc',
  border3: '#eeddc2',
  tileBg: '#fbf7ee',
  disabledBg: '#e6d8c0',
  disabledFg: '#b3a184',
  scrim: 'rgba(35,22,16,0.42)',
}

/** Show just the distinct part ("3" from "Table 3"), or the full name if custom. */
export function shortName(name, label) {
  if (!name) return ''
  const prefix = `${label} `
  return name.startsWith(prefix) ? name.slice(prefix.length) : name
}
