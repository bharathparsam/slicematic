// validators.js
// Small, pure validation functions. Each returns { valid: boolean, error: string }.
// No DOM access, no side effects — trivially unit-testable and explainable.

/**
 * Customer name: alphabets and spaces only, 2–40 characters.
 * A string of only spaces is rejected (trimmed length must be >= 2).
 */
export function validateName(rawName) {
  const name = (rawName ?? '').trim()
  if (name === '') {
    return { valid: false, error: 'Name is required.' }
  }
  if (name.length < 2 || name.length > 40) {
    return { valid: false, error: 'Name must be 2–40 characters.' }
  }
  if (!/^[A-Za-z ]+$/.test(name)) {
    return { valid: false, error: 'Name may contain letters and spaces only.' }
  }
  return { valid: true, error: '' }
}

/**
 * Phone: exactly 10 digits, first digit must be 6, 7, 8, or 9.
 */
export function validatePhone(rawPhone) {
  const phone = (rawPhone ?? '').trim()
  if (phone === '') {
    return { valid: false, error: 'Phone number is required.' }
  }
  if (!/^\d{10}$/.test(phone)) {
    return { valid: false, error: 'Phone must be exactly 10 digits.' }
  }
  if (!/^[6-9]/.test(phone)) {
    return { valid: false, error: 'Phone must start with 6, 7, 8, or 9.' }
  }
  return { valid: true, error: '' }
}

/**
 * Quantity: integer 1–10 only. Rejects 0, negatives, >10, non-integers, empty.
 * Accepts a string or number (form inputs give strings).
 */
export function validateQuantity(rawQty) {
  if (rawQty === '' || rawQty === null || rawQty === undefined) {
    return { valid: false, error: 'Quantity is required.' }
  }
  // Reject anything that isn't a clean integer string / integer number.
  const str = String(rawQty).trim()
  if (!/^-?\d+$/.test(str)) {
    return { valid: false, error: 'Quantity must be a whole number.' }
  }
  const qty = Number(str)
  if (qty < 1 || qty > 10) {
    return { valid: false, error: 'Quantity must be between 1 and 10.' }
  }
  return { valid: true, error: '' }
}
