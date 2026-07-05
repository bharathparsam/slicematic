export const OPS_CONFIG_FILE = '/config/ops_config.json'

export const DEFAULT_OPS_CONFIG = Object.freeze({
  prep_sla_minutes: 12,
  queue_poll_ms: 12000,
  store_open_hour: 11,
  store_close_hour: 23,
})

export function parseOpsConfig(raw) {
  const d = DEFAULT_OPS_CONFIG
  if (!raw || typeof raw !== 'object') {
    console.warn('[opsConfig] config missing — using defaults')
    return { ...d }
  }
  let prep = Number(raw.prep_sla_minutes)
  if (!Number.isFinite(prep) || prep <= 0) prep = d.prep_sla_minutes
  let poll = Number(raw.queue_poll_ms)
  if (!Number.isFinite(poll) || poll < 3000) poll = d.queue_poll_ms
  let openHour = Number(raw.store_open_hour)
  if (!Number.isFinite(openHour) || openHour < 0 || openHour > 23) openHour = d.store_open_hour
  let closeHour = Number(raw.store_close_hour)
  if (!Number.isFinite(closeHour) || closeHour < 1 || closeHour > 24) closeHour = d.store_close_hour
  return { prep_sla_minutes: prep, queue_poll_ms: poll, store_open_hour: openHour, store_close_hour: closeHour }
}

export async function loadOpsConfig() {
  try {
    const res = await fetch(OPS_CONFIG_FILE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parseOpsConfig(await res.json())
  } catch (err) {
    console.warn('[opsConfig] load failed — using defaults', err)
    return { ...DEFAULT_OPS_CONFIG }
  }
}
