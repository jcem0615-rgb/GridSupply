import { db } from './dexie'
import { nowIso, uuid } from '../ids'
import { sellingPrice } from '../money'
import type {
  CatalogItem,
  ItemUnit,
  PaymentMethod,
  Profile,
  School,
  Supplier,
  TaxConfig,
} from '../../types'

export const SCHOOL_ID = '11111111-1111-4111-8111-111111111111'
export const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222'
export const TAX_CONFIG_ID = '33333333-3333-4333-8333-333333333333'

const school: School = {
  id: SCHOOL_ID,
  name: 'Bagong Silang Elementary School',
  school_id_number: '104721',
  division: 'Division of Caloocan City',
  district: 'District III',
  address: 'Phase 7, Barangay 176, Bagong Silang, Caloocan City',
  tin: '000-123-456-00000',
  logo_url: null,
  hero_url: null,
  status: 'active',
  created_at: nowIso(),
}

const supplier: Supplier = {
  id: SUPPLIER_ID,
  name: 'Northgate School Supplies Trading',
  owner_name: 'Marites Delos Reyes',
  tin: '007-889-221-00000',
  address: '12 Quirino Highway, Novaliches, Quezon City',
  contact_number: '0917-555-0142',
  vat_registered: true,
  logo_url: null,
  hero_url: null,
  status: 'active',
  subscription_paid_until: null,
  created_at: nowIso(),
}

const profile = (
  id: string,
  email: string,
  full_name: string,
  role: Profile['role'],
  position_title: string,
  school_id: string | null,
  supplier_id: string | null,
): Profile => ({
  id,
  email,
  full_name,
  role,
  school_id,
  supplier_id,
  position_title,
  status: 'active',
  created_at: nowIso(),
})

export const SEED_PROFILES: Profile[] = [
  profile('p-owner', 'owner@gridsupply.ph', 'Jose Cruz', 'owner', 'Platform Administrator', null, null),
  profile('p-principal', 'principal@bses.deped.gov.ph', 'Dr. Elena Villanueva', 'principal', 'School Principal IV', SCHOOL_ID, null),
  profile('p-supplier-owner', 'marites@northgate.ph', 'Marites Delos Reyes', 'supplier_owner', 'Proprietor', null, SUPPLIER_ID),
  profile('p-supplier-emp', 'jayson@northgate.ph', 'Jayson Bautista', 'supplier_employee', 'Sales Associate', null, SUPPLIER_ID),
]

const item = (
  name: string,
  description: string,
  unit: ItemUnit,
  base_cost: number,
  markup_pct: number,
): CatalogItem => ({
  id: uuid(),
  supplier_id: SUPPLIER_ID,
  name,
  description,
  unit,
  base_cost,
  markup_pct,
  selling_price: sellingPrice(base_cost, markup_pct),
  active: true,
  created_at: nowIso(),
})

const CATALOG: CatalogItem[] = [
  item('Bond Paper A4', 'Substance 20, 500 sheets per ream', 'ream', 210, 18),
  item('Bond Paper Long', 'Substance 20, 500 sheets per ream', 'ream', 245, 18),
  item('Whiteboard Marker', 'Refillable, black — box of 12', 'box', 320, 22),
  item('Manila Paper', '20 sheets per pack', 'pack', 85, 25),
  item('Chalk, Dustless', '100 pieces per box', 'box', 145, 20),
  item('Ballpen, Black', '50 pieces per box', 'box', 260, 20),
  item('Printer Ink 003 Black', 'Compatible refill bottle, 65ml', 'bot', 380, 15),
  item('Storage Box, 60L', 'Heavy duty with lid', 'unit', 690, 17),
  item('Alcohol 70% Ethyl', '500ml bottle', 'bot', 78, 24),
  item('Trash Bag, XL', '100 pieces per pack', 'pack', 320, 20),
  item('Cartolina, Assorted', '20 sheets per pack', 'pack', 110, 25),
  item('Folder, Long', '100 pieces per pack', 'pack', 340, 19),
]

const method = (
  id: string,
  label: string,
  kind: PaymentMethod['kind'],
  account_name: string,
  account_number: string,
  bank_name: string,
  instructions: string,
  sort_order: number,
): PaymentMethod => ({
  id,
  label,
  kind,
  account_name,
  account_number,
  bank_name,
  instructions,
  qr_attachment_id: null,
  active: true,
  sort_order,
  created_at: nowIso(),
  updated_at: nowIso(),
})

const PAYMENT_METHODS: PaymentMethod[] = [
  method(
    'pm-gcash',
    'GCash',
    'gcash',
    'GridSupply Technologies',
    '0917 555 0142',
    '',
    'Send the exact amount and keep the reference number shown after sending.',
    1,
  ),
  method(
    'pm-bank',
    'BPI Savings',
    'bank_transfer',
    'GridSupply Technologies Inc.',
    '1234-5678-90',
    'Bank of the Philippine Islands',
    'Use your supplier name as the transfer remark so we can match the payment.',
    2,
  ),
]

const taxConfig: TaxConfig = {
  id: TAX_CONFIG_ID,
  vat_rate: 0.12,
  ewt_rate: 0.01,
  final_vat_withheld_rate: 0.05,
  ewt_atc: 'WC158',
  vat_atc: 'WV010',
  effective_from: '2024-01-01',
}

/** Idempotent — safe to call on every boot. */
export async function seedIfEmpty() {
  /* Payment methods arrived in v3, so an older install has tenants but no
     methods — backfill them without touching anything else. */
  if ((await db.payment_methods.count()) === 0) await db.payment_methods.bulkPut(PAYMENT_METHODS)
  const count = await db.schools.count()
  if (count > 0) return
  await db.transaction(
    'rw',
    [db.schools, db.suppliers, db.profiles, db.catalog_items, db.tax_config, db.payment_methods],
    async () => {
      await db.schools.put(school)
      await db.suppliers.put(supplier)
      await db.profiles.bulkPut(SEED_PROFILES)
      await db.catalog_items.bulkPut(CATALOG)
      await db.tax_config.put(taxConfig)
      await db.payment_methods.bulkPut(PAYMENT_METHODS)
    },
  )
}

export async function resetAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedIfEmpty()
}

export async function getTaxConfig(): Promise<TaxConfig> {
  return (await db.tax_config.get(TAX_CONFIG_ID)) ?? taxConfig
}
