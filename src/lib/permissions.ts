import type { OrderStatus, Role } from '../types'

/**
 * Every guarded action in the app, mapped to the roles allowed to perform it.
 *
 * The school side is the Principal plus at most one School Admin. The admin
 * performs every school-side step the Principal can, so the two accounts are
 * interchangeable in the workflow — but only the Principal manages the school's
 * accounts, so an admin cannot remove the Principal.
 *
 * Separation of duties lives on the printed documents instead — each template
 * names its own signatories (docs/08), so a DV can still be certified by a
 * named Disbursing Officer without that person needing an account.
 */
export const PERMISSIONS = {
  'pr.create': ['principal', 'school_admin'],
  'pr.edit': ['principal', 'school_admin'],
  'pr.submit': ['principal', 'school_admin'],
  'pr.approve': ['principal', 'school_admin'],
  'pr.reject': ['principal', 'school_admin'],
  'po.issue': ['principal', 'school_admin'],
  'po.accept': ['supplier_owner', 'supplier_employee'],
  'po.decline': ['supplier_owner'],
  'delivery.dispatch': ['supplier_owner', 'supplier_employee'],
  'delivery.receive': ['principal', 'school_admin'],
  'dv.issue': ['principal', 'school_admin'],
  'check.capture': ['principal', 'school_admin'],
  'bir2307.issue': ['principal', 'school_admin'],
  'catalog.manage': ['supplier_owner', 'supplier_employee'],
  'catalog.pricing': ['supplier_owner'],
  'supplier.staff': ['supplier_owner'],
  /* Coarse gate for showing reset UI at all; canResetPasswordFor() in
     lib/accounts.ts decides which specific accounts are in reach. */
  'password.reset': ['owner', 'supplier_owner'],
  'subscription.pay': ['supplier_owner'],
  'subscription.review': ['owner'],
  'payment.methods.manage': ['owner'],
  'accounts.manage': ['owner'],
  'branding.manage': ['owner'],
  'template.customize': ['principal', 'school_admin'],
  'chat.post': ['principal', 'school_admin', 'supplier_owner', 'supplier_employee', 'owner'],
  /* Only the Principal manages the school's own accounts — an admin that could
     delete the Principal would be an admin that can lock the school out. */
  'school.staff': ['principal'],
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
