import Dexie, { type Table } from 'dexie'
import type {
  Attachment,
  BrandingSettings,
  CatalogItem,
  Message,
  Order,
  OrderEvent,
  OrderLine,
  OutboxEntry,
  PaymentMethod,
  SupplierClient,
  ThreadRead,
  PrintTemplate,
  Profile,
  School,
  SubscriptionPayment,
  Supplier,
  TaxConfig,
} from '../../types'

/**
 * Local-first store. Every mutation lands here first and is mirrored into
 * `outbox`; the sync layer drains the outbox to Supabase when it is reachable.
 * See docs/06-pwa-offline-strategy.md.
 */
export class GridSupplyDB extends Dexie {
  profiles!: Table<Profile, string>
  schools!: Table<School, string>
  suppliers!: Table<Supplier, string>
  catalog_items!: Table<CatalogItem, string>
  orders!: Table<Order, string>
  order_lines!: Table<OrderLine, string>
  order_events!: Table<OrderEvent, string>
  messages!: Table<Message, string>
  attachments!: Table<Attachment, string>
  subscription_payments!: Table<SubscriptionPayment, string>
  payment_methods!: Table<PaymentMethod, string>
  tax_config!: Table<TaxConfig, string>
  branding!: Table<BrandingSettings, string>
  print_templates!: Table<PrintTemplate, string>
  supplier_clients!: Table<SupplierClient, string>
  thread_reads!: Table<ThreadRead, string>
  outbox!: Table<OutboxEntry, number>

  constructor() {
    super('gridsupply')
    this.version(1).stores({
      profiles: 'id, email, role, school_id, supplier_id',
      schools: 'id, name, status',
      suppliers: 'id, name, status',
      catalog_items: 'id, supplier_id, active',
      orders: 'id, client_uuid, school_id, supplier_id, status, created_at',
      order_lines: 'id, order_id',
      order_events: 'id, order_id, created_at',
      messages: 'id, client_uuid, order_id, created_at',
      attachments: 'id, kind',
      subscription_payments: 'id, client_uuid, supplier_id, status',
      tax_config: 'id, effective_from',
      branding: 'id, scope, scope_id',
      print_templates: 'id, school_id, doc_type',
      outbox: '++id, client_uuid, table, synced_at, created_at',
    })

    /**
     * v2 collapsed the school side onto a single Principal account. A browser
     * carrying a v1 database still holds the retired officer profiles, and the
     * login screen renders straight from this table — so drop them here rather
     * than leaving dead accounts that can no longer act on anything.
     */
    this.version(2).upgrade(async (tx) => {
      const retired = ['custodian', 'bac', 'disbursing']
      await tx
        .table('profiles')
        .filter((p: { role: string }) => retired.includes(p.role))
        .delete()
    })

    /**
     * v3 introduces owner-published payment methods. Existing submissions
     * carried a hardcoded `method` string; carry it across as the label
     * snapshot so payment history keeps reading correctly.
     */
    this.version(3)
      .stores({ payment_methods: 'id, kind, active, sort_order' })
      .upgrade(async (tx) => {
        await tx
          .table('subscription_payments')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.method_label === undefined) {
              row.method_label = row.method === 'bank_transfer' ? 'Bank transfer' : 'GCash'
            }
            if (row.payment_method_id === undefined) row.payment_method_id = null
            delete row.method
          })
      })

    /**
     * v4 adds credential fields. Rows written by earlier versions simply lack
     * them, and `password_hash: null` is what "no password set yet" means, so
     * normalise rather than leaving the fields undefined.
     */
    this.version(4).upgrade(async (tx) => {
      await tx
        .table('profiles')
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          row.password_hash ??= null
          row.password_salt ??= null
          row.must_change_password ??= false
          row.password_updated_at ??= null
          row.password_reset_by ??= null
          row.password_reset_at ??= null
        })
    })

    /**
     * v5 records which order threads a user has caught up on. Deliberately
     * local-only and never enqueued to the outbox: a read marker is a per-user
     * UI nicety, and syncing one write per thread-open would swamp the queue
     * that carries purchase orders.
     */
    this.version(5).stores({ thread_reads: 'id, profile_id, order_id' })

    /**
     * v6 adds the supplier's own notes about each school it serves. Unlike
     * thread_reads this is real business data, so it goes through the outbox
     * like everything else.
     */
    this.version(6).stores({ supplier_clients: 'id, supplier_id, school_id' })
  }
}

export const db = new GridSupplyDB()
