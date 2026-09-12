/** Domain model for GridSupply. Mirrors supabase/schema.sql one-for-one. */

export type Role = 'owner' | 'principal' | 'supplier_owner' | 'supplier_employee'

export type Portal = 'owner' | 'school' | 'supplier'

export const ROLE_PORTAL: Record<Role, Portal> = {
  owner: 'owner',
  principal: 'school',
  supplier_owner: 'supplier',
  supplier_employee: 'supplier',
}

/** A persisted session from an older build may name a role that no longer exists. */
export function isKnownRole(role: string | undefined): role is Role {
  return !!role && role in ROLE_PORTAL
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Platform Owner',
  principal: 'School Principal',
  supplier_owner: 'Supplier Owner',
  supplier_employee: 'Supplier Employee',
}

export type AccountStatus = 'active' | 'paused' | 'stopped'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  school_id: string | null
  supplier_id: string | null
  position_title: string | null
  status: AccountStatus
  created_at: string
  /* Credentials — only ever a PBKDF2 digest, never a password. Null until one
     is set; unused when Supabase Auth is wired. */
  password_hash: string | null
  password_salt: string | null
  /** Set by an admin reset; forces a change on next sign-in. */
  must_change_password: boolean
  password_updated_at: string | null
  password_reset_by: string | null
  password_reset_at: string | null
}

export interface School {
  id: string
  name: string
  school_id_number: string
  division: string
  district: string
  address: string
  tin: string
  logo_url: string | null
  hero_url: string | null
  status: AccountStatus
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  owner_name: string
  tin: string
  address: string
  contact_number: string
  vat_registered: boolean
  logo_url: string | null
  hero_url: string | null
  status: AccountStatus
  subscription_paid_until: string | null
  created_at: string
}

export type ItemUnit = 'pc' | 'box' | 'ream' | 'pack' | 'set' | 'bot' | 'unit'

export interface CatalogItem {
  id: string
  supplier_id: string
  name: string
  description: string
  unit: ItemUnit
  base_cost: number
  markup_pct: number
  /** base_cost * (1 + markup_pct/100), VAT-inclusive price quoted to schools. */
  selling_price: number
  active: boolean
  created_at: string
}

/** The 9-step lifecycle from docs/03-order-lifecycle.md. */
export type OrderStatus =
  | 'draft'
  | 'pr_submitted'
  | 'pr_approved'
  | 'pr_rejected'
  | 'po_issued'
  | 'po_accepted'
  | 'po_declined'
  | 'dispatched'
  | 'delivered'
  | 'dv_issued'
  | 'paid'
  | 'archived'

export const ORDER_FLOW: OrderStatus[] = [
  'draft',
  'pr_submitted',
  'pr_approved',
  'po_issued',
  'po_accepted',
  'dispatched',
  'delivered',
  'dv_issued',
  'paid',
  'archived',
]

export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft PR',
  pr_submitted: 'Awaiting Approval',
  pr_approved: 'PR Approved',
  pr_rejected: 'PR Rejected',
  po_issued: 'PO Issued',
  po_accepted: 'PO Accepted',
  po_declined: 'PO Declined',
  dispatched: 'In Transit',
  delivered: 'Delivered / IAR Signed',
  dv_issued: 'DV Issued',
  paid: 'Paid',
  archived: 'Archived',
}

export interface OrderLine {
  id: string
  order_id: string
  catalog_item_id: string | null
  name: string
  description: string
  unit: ItemUnit
  qty: number
  unit_price: number
  line_total: number
}

export interface Order {
  id: string
  client_uuid: string
  school_id: string
  supplier_id: string | null
  status: OrderStatus
  pr_number: string
  po_number: string | null
  dv_number: string | null
  iar_number: string | null
  purpose: string
  fund_source: string
  /** Sum of line totals — VAT-inclusive gross. */
  gross_total: number
  requested_by: string | null
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  po_issued_at: string | null
  accepted_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  received_by: string | null
  iar_signature: string | null
  dv_issued_at: string | null
  paid_at: string | null
  check_number: string | null
  check_photo_id: string | null
  bir_2307_issued: boolean
  created_at: string
  updated_at: string
}

export interface OrderEvent {
  id: string
  order_id: string
  actor_id: string | null
  actor_name: string
  status_from: OrderStatus | null
  status_to: OrderStatus | null
  note: string
  created_at: string
}

export type MessageKind = 'user' | 'system'

export interface Message {
  id: string
  client_uuid: string
  order_id: string
  author_id: string | null
  author_name: string
  author_role: Role | 'system'
  kind: MessageKind
  body: string
  attachment_id: string | null
  created_at: string
}

/** Locally-held binary (check photos, payment proofs, branding). */
export interface Attachment {
  id: string
  kind: 'check_photo' | 'payment_proof' | 'logo' | 'hero' | 'chat'
  name: string
  mime: string
  data_url: string
  created_at: string
}

export type PaymentMethodKind = 'gcash' | 'bank_transfer' | 'maya' | 'other'

export const PAYMENT_KIND_LABEL: Record<PaymentMethodKind, string> = {
  gcash: 'GCash',
  bank_transfer: 'Bank transfer',
  maya: 'Maya',
  other: 'Other',
}

/**
 * How the platform owner wants to be paid. Owned by the Owner Portal and read
 * by every supplier, so a supplier pays into an account the owner published
 * rather than one hardcoded in the build.
 */
export interface PaymentMethod {
  id: string
  label: string
  kind: PaymentMethodKind
  account_name: string
  account_number: string
  bank_name: string
  instructions: string
  /** Uploaded QR code the supplier can scan. */
  qr_attachment_id: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected'

export interface SubscriptionPayment {
  id: string
  client_uuid: string
  supplier_id: string
  amount: number
  payment_method_id: string | null
  /** Snapshot of the method's name at submission, so history survives deletion. */
  method_label: string
  reference: string
  period_covered: string
  proof_attachment_id: string | null
  status: PaymentStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

/** docs/05 — rates live in a config table, never as constants. */
export interface TaxConfig {
  id: string
  vat_rate: number
  ewt_rate: number
  final_vat_withheld_rate: number
  ewt_atc: string
  vat_atc: string
  effective_from: string
}

export interface BrandingSettings {
  id: string
  scope: 'school' | 'supplier' | 'platform'
  scope_id: string | null
  logo_attachment_id: string | null
  hero_attachment_id: string | null
  accent: string
  updated_at: string
}

/** Print-template customizer state (docs 08 / Phase 8). */
export interface PrintTemplate {
  id: string
  school_id: string
  doc_type: 'PR' | 'PO' | 'IAR' | 'DV' | 'BIR2307'
  header_left_attachment_id: string | null
  header_right_attachment_id: string | null
  header_lines: string[]
  footer_note: string
  show_seal: boolean
  signatories: { label: string; name: string; title: string }[]
  updated_at: string
}

/** Per-user, per-order "caught up to here" marker. Local-only; see dexie.ts. */
export interface ThreadRead {
  id: string
  profile_id: string
  order_id: string
  last_read_at: string
}

export type OutboxOp = 'insert' | 'update' | 'delete'

export interface OutboxEntry {
  id?: number
  client_uuid: string
  table: string
  op: OutboxOp
  payload: Record<string, unknown>
  created_at: string
  attempts: number
  last_error: string | null
  synced_at: string | null
}
