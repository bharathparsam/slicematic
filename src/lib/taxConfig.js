// taxConfig.js
// Loads the GST + discount configuration from /config/tax_config.json at runtime
// (the billing counterpart of the menu .txt files). Rates live in data, not code,
// so a Delhi standalone restaurant on 5% GST today can move to 18% tomorrow — or
// a hotel restaurant — by editing one file. Parsing is defensive: any bad/missing
// field falls back to the safe default and the app keeps working.
//
// Rate basis: standalone restaurant / takeaway = 5% GST, no input tax credit,
// split 2.5% CGST + 2.5% SGST.
// See: https://cleartax.in/s/impact-gst-food-services-restaurant-business

export const TAX_CONFIG_FILE = '/config/tax_config.json'

/** Safe defaults — used when the config file is missing or a field is invalid. */
export const DEFAULT_TAX_CONFIG = Object.freeze({
  serviceType: 'standalone_restaurant',
  gst: { label: 'GST', rate: 0.05, cgst: 0.025, sgst: 0.025, inputTaxCredit: false },
  discount: { rate: 0.1, minQuantity: 5 },
})

const isRate = (n) => Number.isFinite(n) && n >= 0 && n <= 1
const isPosInt = (n) => Number.isInteger(n) && n > 0

/**
 * Validate + normalise a raw config object into a complete, safe config.
 * Pure: raw in, config out. Never throws; warns on each fallback.
 * @param {any} raw
 * @returns {typeof DEFAULT_TAX_CONFIG}
 */
export function parseTaxConfig(raw) {
  const d = DEFAULT_TAX_CONFIG
  if (!raw || typeof raw !== 'object') {
    console.warn('[taxConfig] config missing or not an object — using defaults')
    return d
  }

  const rawGst = raw.gst ?? {}
  const rawDisc = raw.discount ?? {}

  // GST rate
  let rate = rawGst.rate
  if (!isRate(rate)) {
    console.warn(`[taxConfig] invalid gst.rate "${rawGst.rate}" — using ${d.gst.rate}`)
    rate = d.gst.rate
  }

  // CGST / SGST split. Must be valid rates that sum to the total rate; otherwise
  // derive an even split so the parts always reconcile with the whole.
  let cgst = rawGst.cgst
  let sgst = rawGst.sgst
  const splitOk =
    isRate(cgst) && isRate(sgst) && Math.abs(cgst + sgst - rate) < 1e-9
  if (!splitOk) {
    cgst = rate / 2
    sgst = rate / 2
    if (rawGst.cgst != null || rawGst.sgst != null) {
      console.warn('[taxConfig] cgst/sgst do not sum to rate — deriving even split')
    }
  }

  // Discount
  let discRate = rawDisc.rate
  if (!isRate(discRate)) {
    console.warn(`[taxConfig] invalid discount.rate "${rawDisc.rate}" — using ${d.discount.rate}`)
    discRate = d.discount.rate
  }
  let minQuantity = rawDisc.minQuantity
  if (!isPosInt(minQuantity)) {
    console.warn(`[taxConfig] invalid discount.minQuantity "${rawDisc.minQuantity}" — using ${d.discount.minQuantity}`)
    minQuantity = d.discount.minQuantity
  }

  return {
    serviceType:
      typeof raw.serviceType === 'string' ? raw.serviceType : d.serviceType,
    gst: {
      label: typeof rawGst.label === 'string' ? rawGst.label : d.gst.label,
      rate,
      cgst,
      sgst,
      inputTaxCredit: rawGst.inputTaxCredit === true,
    },
    discount: { rate: discRate, minQuantity },
  }
}

/**
 * Fetch + parse the tax config. Unlike the menu (which must exist), a missing or
 * broken config file is non-fatal: we log and fall back to DEFAULT_TAX_CONFIG so
 * billing still works. Returns a fully-formed, validated config.
 * @returns {Promise<typeof DEFAULT_TAX_CONFIG>}
 */
export async function loadTaxConfig() {
  try {
    const res = await fetch(TAX_CONFIG_FILE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json()
    return parseTaxConfig(raw)
  } catch (err) {
    console.warn(
      `[taxConfig] could not load ${TAX_CONFIG_FILE} (${err.message}) — using defaults`
    )
    return DEFAULT_TAX_CONFIG
  }
}
