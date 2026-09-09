-- One test school + one test supplier, matching src/lib/db/seed.ts.
-- Run AFTER schema.sql. Profiles are created by the auth trigger when you
-- invite the users below — this file seeds only the tenant-level rows.

insert into schools (id, name, school_id_number, division, district, address, tin)
values (
  '11111111-1111-4111-8111-111111111111',
  'Bagong Silang Elementary School',
  '104721',
  'Division of Caloocan City',
  'District III',
  'Phase 7, Barangay 176, Bagong Silang, Caloocan City',
  '000-123-456-00000'
) on conflict (id) do nothing;

insert into suppliers (id, name, owner_name, tin, address, contact_number, vat_registered)
values (
  '22222222-2222-4222-8222-222222222222',
  'Northgate School Supplies Trading',
  'Marites Delos Reyes',
  '007-889-221-00000',
  '12 Quirino Highway, Novaliches, Quezon City',
  '0917-555-0142',
  true
) on conflict (id) do nothing;

insert into payment_methods (label, kind, account_name, account_number, bank_name, instructions, sort_order) values
  ('GCash', 'gcash', 'GridSupply Technologies', '0917 555 0142', '',
   'Send the exact amount and keep the reference number shown after sending.', 1),
  ('BPI Savings', 'bank_transfer', 'GridSupply Technologies Inc.', '1234-5678-90',
   'Bank of the Philippine Islands',
   'Use your supplier name as the transfer remark so we can match the payment.', 2)
on conflict do nothing;

insert into tax_config (vat_rate, ewt_rate, final_vat_withheld_rate, ewt_atc, vat_atc, effective_from)
values (0.12, 0.01, 0.05, 'WC158', 'WV010', '2024-01-01')
on conflict do nothing;

insert into catalog_items (supplier_id, name, description, unit, base_cost, markup_pct, selling_price) values
  ('22222222-2222-4222-8222-222222222222', 'Bond Paper A4', 'Substance 20, 500 sheets per ream', 'ream', 210, 18, 247.80),
  ('22222222-2222-4222-8222-222222222222', 'Bond Paper Long', 'Substance 20, 500 sheets per ream', 'ream', 245, 18, 289.10),
  ('22222222-2222-4222-8222-222222222222', 'Whiteboard Marker', 'Refillable, black — box of 12', 'box', 320, 22, 390.40),
  ('22222222-2222-4222-8222-222222222222', 'Manila Paper', '20 sheets per pack', 'pack', 85, 25, 106.25),
  ('22222222-2222-4222-8222-222222222222', 'Chalk, Dustless', '100 pieces per box', 'box', 145, 20, 174.00),
  ('22222222-2222-4222-8222-222222222222', 'Ballpen, Black', '50 pieces per box', 'box', 260, 20, 312.00)
on conflict do nothing;

-- Invite the test users from the Supabase dashboard (Authentication → Invite)
-- with this user metadata so the handle_new_user trigger builds their profile:
--
--   Principal:  {"full_name":"Dr. Elena Villanueva","role":"principal",
--                "school_id":"11111111-1111-4111-8111-111111111111",
--                "position_title":"School Principal IV"}
--   Supplier:   {"full_name":"Marites Delos Reyes","role":"supplier_owner",
--                "supplier_id":"22222222-2222-4222-8222-222222222222"}
--   Employee:   {"full_name":"Jayson Bautista","role":"supplier_employee",
--                "supplier_id":"22222222-2222-4222-8222-222222222222"}
--   Owner:      {"full_name":"Jose Cruz","role":"owner"}
--
-- One Principal account covers the whole school side. The officers who sign
-- the paper (Property Custodian, BAC, Disbursing Officer) are named per
-- document in print_templates.signatories and do not need accounts.
