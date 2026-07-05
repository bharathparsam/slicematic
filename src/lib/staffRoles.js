/** Staff roles that may complete/cancel orders (release tables). */
const ORDER_MANAGER_ROLES = new Set(['manager', 'admin'])

/**
 * Whether a staff member may complete or cancel orders.
 * @param {string | undefined | null} role
 */
export function canManageOrders(role) {
  return ORDER_MANAGER_ROLES.has(String(role ?? '').toLowerCase())
}
