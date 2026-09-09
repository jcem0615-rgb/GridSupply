import type { OrderStatus, Role } from '../types'

/**
 * Every guarded action in the app, mapped to the roles allowed to perform it.
 *
 * The school side is a single Principal account: one login performs every
 * school-side step. Separation of duties lives on the printed documents
 * instead — each template names its own signatories (docs/08), so a DV can
 * still be certified by a named Disbursing Officer without that person
 * needing an account.
 */
export const PERMISSIONS = {
  'pr.create': ['principal'],
  'pr.edit': ['principal'],
  'pr.submit': ['principal'],
  'pr.approve': ['principal'],
  'pr.reject': ['principal'],
  'po.issue': ['principal'],
  'po.accept': ['supplier_owner', 'supplier_employee'],
  'po.decline': ['supplier_owner'],
  'delivery.dispatch': ['supplier_owner', 'supplier_employee'],
  'delivery.receive': ['principal'],
  'dv.issue': ['principal'],
  'check.capture': ['principal'],
  'bir2307.issue': ['principal'],
  'catalog.manage': ['supplier_owner', 'supplier_employee'],
  'catalog.pricing': ['supplier_owner'],
  'supplier.staff': ['supplier_owner'],
  'subscription.pay': ['supplier_owner'],
  'subscription.review': ['owner'],
  'payment.methods.manage': ['owner'],
  'accounts.manage': ['owner'],
  'branding.manage': ['owner'],
  'template.customize': ['principal'],
  'chat.post': ['principal', 'supplier_owner', 'supplier_employee', 'owner'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false
  return (PERMISSIONS[permission] as readonly Role[]).includes(role)
}

/** Which status a given action moves an order into, for UI affordances. */
export const ACTION_REQUIRES_STATUS: Partial<Record<Permission, OrderStatus[]>> = {
  'pr.edit': ['draft'],
  'pr.submit': ['draft'],
  'pr.approve': ['pr_submitted'],
  'pr.reject': ['pr_submitted'],
  'po.issue': ['pr_approved'],
  'po.accept': ['po_issued'],
  'po.decline': ['po_issued'],
  'delivery.dispatch': ['po_accepted'],
  'delivery.receive': ['dispatched'],
  'dv.issue': ['delivered'],
  'check.capture': ['dv_issued'],
  'bir2307.issue': ['paid'],
}

export function canActNow(
  role: Role | undefined,
  permission: Permission,
  status: OrderStatus,
): boolean {
  if (!can(role, permission)) return false
  const required = ACTION_REQUIRES_STATUS[permission]
  return !required || required.includes(status)
}
