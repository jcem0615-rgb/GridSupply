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
  tax_config!: Table<TaxConfig, string>
  branding!: Table<BrandingSettings, string>
  print_templates!: Table<PrintTemplate, string>
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
  }
}

export const db = new GridSupplyDB()
