-- GridSupply — schema, RLS and storage policies.
-- Multi-tenant by Row Level Security only: one project, three portals.
-- Apply with: supabase db push, or paste into the SQL editor of a fresh project.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────
-- The school side is a single Principal account; separation of duties is
-- expressed on the printed documents via print_templates.signatories, not by
-- giving every officer a login.
create type user_role as enum (
  'owner', 'principal', 'school_admin', 'supplier_owner', 'supplier_employee'
);

create type account_status as enum ('active', 'paused', 'stopped');

create type order_status as enum (
  'draft', 'pr_submitted', 'pr_approved', 'pr_rejected',
  'po_issued', 'po_accepted', 'po_declined',
  'dispatched', 'delivered', 'dv_issued', 'paid', 'archived'
);

create type payment_status as enum ('pending', 'approved', 'rejected');
create type message_kind as enum ('user', 'system');

-- ─────────────────────────────────────────────────────────────
-- Tenants
-- ─────────────────────────────────────────────────────────────
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_id_number text not null unique,
  division text not null,
  district text not null default '',
  address text not null default '',
  tin text not null default '',
  logo_url text,
  hero_url text,
  status account_status not null default 'active',
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text not null default '',
  tin text not null default '',
  address text not null default '',
  contact_number text not null default '',
  vat_registered boolean not null default true,
  logo_url text,
  hero_url text,
  status account_status not null default 'active',
  subscription_paid_until date,
  created_at timestamptz not null default now()
);

-- auth.uid() is identity; this row is authorization.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role user_role not null,
  school_id uuid references schools (id) on delete cascade,
  supplier_id uuid references suppliers (id) on delete cascade,
  position_title text,
  status account_status not null default 'active',
  created_at timestamptz not null default now(),
  -- Credentials live in Supabase Auth; these track admin-initiated resets so
  -- the UI can force a change and show who reset whom. Never a password.
  must_change_password boolean not null default false,
  password_updated_at timestamptz,
  password_reset_by uuid,
  password_reset_at timestamptz,
  -- A profile belongs to exactly one tenant, except the platform owner.
  constraint profile_tenant_exclusive check (
    (role = 'owner' and school_id is null and supplier_id is null)
    or (role in ('principal','school_admin') and school_id is not null and supplier_id is null)
    or (role in ('supplier_owner','supplier_employee') and supplier_id is not null and school_id is null)
  )
);

create index on profiles (school_id);
create index on profiles (supplier_id);

-- ─────────────────────────────────────────────────────────────
-- Helper functions — SECURITY DEFINER so policies can read profiles
-- without recursing through profiles' own RLS.
--
-- Every one of them requires status = 'active'. Suspending an account is an
-- Owner Portal button, but a JWT issued before the suspension stays valid
-- until it expires, so an account paused or stopped in the UI would otherwise
-- keep full database access for the rest of its session. Answering null here
-- makes every tenant-scoped policy fall through to false at once. A suspended
-- user can still read their own profile row — `profiles_select` matches on
-- auth.uid() directly — so the app can tell them why they are locked out.
-- ─────────────────────────────────────────────────────────────
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active'
$$;

create or replace function auth_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from profiles where id = auth.uid() and status = 'active'
$$;

create or replace function auth_supplier_id() returns uuid
language sql stable security definer set search_path = public as $$
  select supplier_id from profiles where id = auth.uid() and status = 'active'
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'owner' and status = 'active'
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- Catalog
-- ─────────────────────────────────────────────────────────────
create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers (id) on delete cascade,
  name text not null,
  description text not null default '',
  unit text not null default 'pc',
  -- What one unit contains, e.g. 500 sheets per ream. 0 when not meaningful.
  pack_size integer not null default 0 check (pack_size >= 0),
  base_cost numeric(12,2) not null check (base_cost >= 0),
  markup_pct numeric(5,2) not null default 0 check (markup_pct >= 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  active boolean not null default true,
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  stock_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index on catalog_items (supplier_id, active);

-- ─────────────────────────────────────────────────────────────
-- Orders — one row carries the whole PR → PO → IAR → DV → 2307 chain
-- ─────────────────────────────────────────────────────────────
create table orders (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,          -- offline idempotency key
  school_id uuid not null references schools (id) on delete cascade,
  supplier_id uuid references suppliers (id) on delete set null,
  status order_status not null default 'draft',
  pr_number text not null,
  po_number text,
  dv_number text,
  iar_number text,
  purpose text not null default '',
  fund_source text not null default 'MOOE',
  gross_total numeric(14,2) not null default 0,
  -- Snapshotted per order: a later change to a supplier's registration must not
  -- restate the tax on a voucher already issued.
  supplier_vat_registered boolean not null default true,
  requested_by uuid references profiles (id) on delete set null,
  approved_by uuid references profiles (id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  po_issued_at timestamptz,
  accepted_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  received_by uuid references profiles (id) on delete set null,
  iar_signature text,
  dv_issued_at timestamptz,
  paid_at timestamptz,
  check_number text,
  check_photo_id uuid,
  bir_2307_issued boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, pr_number)
);

create index on orders (school_id, status);
create index on orders (supplier_id, status);

-- Append-only stock ledger. Each row carries the balance it left behind, so
-- history reads without replaying every movement and a wrong balance is
-- visible against the moves that produced it.
create table stock_moves (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers (id) on delete cascade,
  catalog_item_id uuid not null references catalog_items (id) on delete cascade,
  -- Signed, and always in the item's own stocking unit; the ledger holds one
  -- unit or balance_after means nothing.
  qty integer not null,
  balance_after integer not null check (balance_after >= 0),
  -- What was actually counted, before conversion. Stock arrives in whatever
  -- the delivery was packed in — ten boxes of twelve reams — and a ledger that
  -- records only the converted 120 hides the arithmetic behind it.
  entry_qty integer not null default 0,
  entry_unit text not null default 'pc',
  entry_factor integer not null default 1 check (entry_factor >= 1),
  reason text not null check (
    reason in ('received', 'order_accepted', 'order_declined', 'adjustment', 'damaged')
  ),
  order_id uuid references orders (id) on delete set null,
  note text not null default '',
  actor_id uuid references profiles (id) on delete set null,
  actor_name text not null default '',
  created_at timestamptz not null default now()
);

create index on stock_moves (supplier_id, created_at desc);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  catalog_item_id uuid references catalog_items (id) on delete set null,
  name text not null,
  description text not null default '',
  unit text not null default 'pc',
  qty numeric(12,2) not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null
);

create index on order_lines (order_id);

create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  actor_id uuid references profiles (id) on delete set null,
  actor_name text not null default '',
  -- Snapshotted: the trail must still say who acted after a role changes.
  actor_role user_role,
  status_from order_status,
  status_to order_status,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index on order_events (order_id, created_at);

create table messages (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  order_id uuid not null references orders (id) on delete cascade,
  author_id uuid references profiles (id) on delete set null,
  author_name text not null default '',
  author_role text not null default 'system',
  kind message_kind not null default 'user',
  body text not null default '',
  attachment_id uuid,
  created_at timestamptz not null default now()
);

create index on messages (order_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- Subscriptions, config, branding, templates
-- ─────────────────────────────────────────────────────────────
-- Where suppliers send the subscription fee. Owned by the platform owner and
-- readable by every signed-in user, so nothing about the destination account
-- is hardcoded in the client build.
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  kind text not null default 'gcash' check (kind in ('gcash', 'bank_transfer', 'maya', 'other')),
  account_name text not null default '',
  account_number text not null default '',
  bank_name text not null default '',
  instructions text not null default '',
  qr_path text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on payment_methods (active, sort_order);

create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  supplier_id uuid not null references suppliers (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  -- Kept on delete: the label snapshot preserves history if a method is removed.
  payment_method_id uuid references payment_methods (id) on delete set null,
  method_label text not null default '',
  reference text not null default '',
  period_covered text not null,
  proof_path text,                            -- storage object path
  status payment_status not null default 'pending',
  reviewed_by uuid references profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index on subscription_payments (supplier_id, status);

-- Rates are data, not constants: a BIR change is an UPDATE, not a deploy.
create table tax_config (
  id uuid primary key default gen_random_uuid(),
  vat_rate numeric(5,4) not null default 0.12,
  ewt_rate numeric(5,4) not null default 0.01,
  final_vat_withheld_rate numeric(5,4) not null default 0.05,
  -- Withheld from non-VAT suppliers in place of the final VAT withholding.
  percentage_tax_rate numeric(5,4) not null default 0.03,
  ewt_atc text not null default 'WC158',
  vat_atc text not null default 'WV010',
  percentage_tax_atc text not null default 'WB080',
  effective_from date not null default current_date
);

create table branding (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'school', 'supplier')),
  scope_id uuid,
  logo_path text,
  hero_path text,
  accent text not null default '#0f3d2e',
  updated_at timestamptz not null default now(),
  unique (scope, scope_id)
);

-- A supplier's own record of each school it serves. Kept apart from `schools`
-- because the school's name, TIN and address print on government documents and
-- are the school's to maintain; what a supplier owns is the relationship.
create table supplier_clients (
  id text primary key,
  supplier_id uuid not null references suppliers (id) on delete cascade,
  school_id uuid not null references schools (id) on delete cascade,
  contact_name text not null default '',
  contact_number text not null default '',
  contact_email text not null default '',
  delivery_notes text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (supplier_id, school_id)
);

create index on supplier_clients (supplier_id);

create table print_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  doc_type text not null check (doc_type in ('PR', 'RFQ', 'PO', 'IAR', 'DV', 'BIR2307')),
  header_left_path text,
  header_right_path text,
  header_lines text[] not null default '{}',
  footer_note text not null default '',
  show_seal boolean not null default true,
  signatories jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (school_id, doc_type)
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- Pattern: owner sees everything; a school row is visible to profiles
-- carrying that school_id; a supplier row to that supplier_id; an order is
-- visible to its school always, and to its supplier only once a PO exists.
-- ─────────────────────────────────────────────────────────────
alter table schools               enable row level security;
alter table suppliers             enable row level security;
alter table profiles              enable row level security;
alter table catalog_items         enable row level security;
alter table orders                enable row level security;
alter table order_lines           enable row level security;
alter table order_events          enable row level security;
alter table messages              enable row level security;
alter table subscription_payments enable row level security;
alter table payment_methods       enable row level security;
alter table tax_config            enable row level security;
alter table branding              enable row level security;
alter table print_templates       enable row level security;
alter table supplier_clients      enable row level security;
alter table stock_moves           enable row level security;

-- profiles: read yourself and your own tenant's staff; owner reads all.
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or is_owner()
  or (school_id is not null and school_id = auth_school_id())
  or (supplier_id is not null and supplier_id = auth_supplier_id())
);
-- You may edit your own row — name, position title, password-change flags —
-- but NOT your own privileges. RLS cannot see the old row in a WITH CHECK, so
-- "did a privileged column move?" is enforced by the trigger further down
-- (profiles_guard_privileges). Without that guard this policy is a one-line
-- privilege escalation: any user could set their own role to 'owner'.
create policy profiles_update_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_owner_write on profiles for all using (is_owner()) with check (is_owner());

-- A supplier owner administers accounts inside their own supplier and nowhere
-- else. Without the supplier_id check on BOTH sides, a supplier could move a
-- school Principal into their tenant and then reset it — so the USING clause
-- (the row as it is) and the WITH CHECK clause (the row as it would become)
-- both have to match their own supplier.
create policy profiles_supplier_owner_write on profiles for all
  using (
    auth_role() = 'supplier_owner'
    and supplier_id is not null
    and supplier_id = auth_supplier_id()
  )
  with check (
    auth_role() = 'supplier_owner'
    and supplier_id is not null
    and supplier_id = auth_supplier_id()
    and school_id is null
    and role in ('supplier_owner', 'supplier_employee')
  );

-- schools / suppliers
create policy schools_select on schools for select using (is_owner() or id = auth_school_id());
create policy schools_owner_write on schools for all using (is_owner()) with check (is_owner());
create policy schools_self_update on schools for update
  using (id = auth_school_id() and auth_role() in ('principal', 'school_admin'))
  with check (id = auth_school_id());

-- The Principal administers accounts inside their own school and nowhere else.
-- Both clauses are checked so a Principal cannot move an outside profile into
-- their school, and the role is constrained so they cannot mint an owner.
-- A school_admin is deliberately excluded: an admin able to delete the
-- Principal is an admin that can lock the school out of its own account.
create policy profiles_principal_write on profiles for all
  using (
    auth_role() = 'principal'
    and school_id is not null
    and school_id = auth_school_id()
  )
  with check (
    auth_role() = 'principal'
    and school_id is not null
    and school_id = auth_school_id()
    and supplier_id is null
    and role in ('principal', 'school_admin')
  );

-- Every school can see active suppliers in order to shop the catalog.
create policy suppliers_select on suppliers for select using (
  is_owner() or id = auth_supplier_id() or (status = 'active' and auth_school_id() is not null)
);
create policy suppliers_owner_write on suppliers for all using (is_owner()) with check (is_owner());
create policy suppliers_self_update on suppliers for update
  using (id = auth_supplier_id() and auth_role() = 'supplier_owner')
  with check (id = auth_supplier_id());

-- catalog: schools read active items; the owning supplier reads and writes all.
create policy catalog_select on catalog_items for select using (
  is_owner() or supplier_id = auth_supplier_id() or (active and auth_school_id() is not null)
);
create policy catalog_write on catalog_items for all
  using (supplier_id = auth_supplier_id())
  with check (supplier_id = auth_supplier_id());

-- orders
create policy orders_select on orders for select using (
  is_owner()
  or school_id = auth_school_id()
  or (
    supplier_id = auth_supplier_id()
    and status not in ('draft', 'pr_submitted', 'pr_approved', 'pr_rejected')
  )
);
create policy orders_school_insert on orders for insert with check (
  school_id = auth_school_id() and auth_role() in ('principal', 'school_admin')
);
create policy orders_school_update on orders for update
  using (school_id = auth_school_id())
  with check (school_id = auth_school_id());
-- A supplier acts on its own order only at the two points the workflow gives
-- it, and the WITH CHECK names the states it may leave behind: accept or
-- decline a PO, then dispatch it. Binding only supplier_id here would let a
-- supplier mark its own order 'paid'. Settlement columns (cheque number,
-- paid_at, the DV, the 2307 flag) are guarded by trigger, since a policy
-- cannot restrict which columns an UPDATE touches.
create policy orders_supplier_update on orders for update
  using (supplier_id = auth_supplier_id() and status in ('po_issued', 'po_accepted'))
  with check (
    supplier_id = auth_supplier_id()
    and status in ('po_accepted', 'po_declined', 'dispatched')
  );

-- Child tables inherit visibility from the parent order.
create or replace function can_see_order(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from orders o
    where o.id = oid
      and (
        is_owner()
        or o.school_id = auth_school_id()
        or (o.supplier_id = auth_supplier_id()
            and o.status not in ('draft','pr_submitted','pr_approved','pr_rejected'))
      )
  )
$$;

create policy order_lines_all on order_lines for all
  using (can_see_order(order_id)) with check (can_see_order(order_id));
-- The audit trail is append-only. 'for all' let either party rewrite or delete
-- the history of a public-funds transaction after the fact, which is the one
-- thing an audit trail exists to prevent — so there is deliberately no update
-- or delete policy here, and the actor is bound to the caller.
create policy order_events_select on order_events for select
  using (can_see_order(order_id));
create policy order_events_insert on order_events for insert
  with check (can_see_order(order_id) and (actor_id is null or actor_id = auth.uid()));

-- Chat is append-only for the same reason: a message quoted in a dispute must
-- still read the same tomorrow.
create policy messages_select on messages for select
  using (can_see_order(order_id));
create policy messages_insert on messages for insert
  with check (can_see_order(order_id) and (author_id is null or author_id = auth.uid()));

-- subscription payments: a supplier sees only its own; the owner reviews all.
create policy subs_select on subscription_payments for select using (
  is_owner() or supplier_id = auth_supplier_id()
);
create policy subs_insert on subscription_payments for insert with check (
  supplier_id = auth_supplier_id() and auth_role() = 'supplier_owner'
);
create policy subs_owner_update on subscription_payments for update
  using (is_owner()) with check (is_owner());

-- Every signed-in user can read the published payment methods; only the owner
-- writes them. Suppliers must see them to pay at all.
create policy payment_methods_select on payment_methods for select using (auth.uid() is not null);
create policy payment_methods_write on payment_methods for all using (is_owner()) with check (is_owner());

-- tax_config is read by everyone, written only by the platform owner.
create policy tax_select on tax_config for select using (auth.uid() is not null);
create policy tax_write on tax_config for all using (is_owner()) with check (is_owner());

create policy branding_select on branding for select using (auth.uid() is not null);
create policy branding_write on branding for all using (is_owner()) with check (is_owner());

-- Stock levels are the supplier's own commercial information; a school has no
-- business reading how thin a vendor's shelves are before negotiating.
create policy stock_moves_all on stock_moves for all
  using (supplier_id = auth_supplier_id())
  with check (supplier_id = auth_supplier_id());

-- The notes are the supplier's private CRM. A school must not read what a
-- vendor writes about it, so there is no school-side select policy at all.
create policy supplier_clients_all on supplier_clients for all
  using (supplier_id = auth_supplier_id())
  with check (supplier_id = auth_supplier_id());

create policy templates_select on print_templates for select using (
  is_owner() or school_id = auth_school_id()
);
create policy templates_write on print_templates for all
  using (school_id = auth_school_id() and auth_role() in ('principal', 'school_admin'))
  with check (school_id = auth_school_id());

-- ─────────────────────────────────────────────────────────────
-- Integrity guards
-- RLS answers "may you touch this row?". It cannot answer "may you move
-- THAT column, from THIS value?" — a WITH CHECK sees only the row as it
-- would become, never as it was. The rules below are exactly the ones that
-- need the old row, so they are triggers rather than policies.
-- ─────────────────────────────────────────────────────────────

-- Privilege columns on a profile: role, tenant and status. Everything else on
-- your own row is yours to edit.
create or replace function profiles_guard_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor user_role;
begin
  -- Migrations, seeds and the service_role key carry no end user; those
  -- contexts are already trusted and the admin Edge Function needs them.
  if auth.uid() is null then
    return new;
  end if;

  if new.role       is not distinct from old.role
 and new.school_id  is not distinct from old.school_id
 and new.supplier_id is not distinct from old.supplier_id
 and new.status     is not distinct from old.status then
    return new;                       -- nothing privileged moved
  end if;

  actor := auth_role();

  if actor = 'owner' then
    return new;
  end if;

  -- Nobody but the platform owner edits their own privileges. This is the
  -- line that stops a supplier employee promoting themselves to 'owner'.
  if old.id = auth.uid() then
    raise exception 'you cannot change your own role, tenant or status'
      using errcode = '42501';
  end if;

  -- A Principal administers accounts inside their own school, and may mint
  -- nothing above a school_admin.
  if actor = 'principal'
 and old.school_id = auth_school_id()
 and new.school_id = auth_school_id()
 and new.supplier_id is null
 and new.role in ('principal', 'school_admin') then
    return new;
  end if;

  -- A Supplier Owner, likewise, inside their own supplier.
  if actor = 'supplier_owner'
 and old.supplier_id = auth_supplier_id()
 and new.supplier_id = auth_supplier_id()
 and new.school_id is null
 and new.role in ('supplier_owner', 'supplier_employee') then
    return new;
  end if;

  raise exception 'not allowed to change role, tenant or status on this profile'
    using errcode = '42501';
end;
$$;

create trigger profiles_guard_privileges_trg
before update on profiles
for each row execute function profiles_guard_privileges();

-- Order columns that decide money. A supplier legitimately accepts, declines
-- and dispatches; it does not issue the voucher, cut the cheque, restate the
-- total or decide its own VAT treatment — the school is the withholding agent.
create or replace function orders_guard_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_owner() then
    return new;
  end if;

  -- Withholdings on an issued voucher must not move: once the DV exists the
  -- VAT snapshot is frozen for everyone, the school included.
  if old.dv_issued_at is not null
 and new.supplier_vat_registered is distinct from old.supplier_vat_registered then
    raise exception 'VAT status is locked once the disbursement voucher is issued'
      using errcode = '42501';
  end if;

  if auth_supplier_id() is null or new.supplier_id is distinct from auth_supplier_id() then
    return new;                       -- not the supplier side of this order
  end if;

  if new.status is distinct from old.status
 and new.status not in ('po_accepted', 'po_declined', 'dispatched') then
    raise exception 'a supplier may only accept, decline or dispatch an order'
      using errcode = '42501';
  end if;

  if new.school_id               is distinct from old.school_id
  or new.gross_total             is distinct from old.gross_total
  or new.supplier_vat_registered is distinct from old.supplier_vat_registered
  or new.po_number               is distinct from old.po_number
  or new.approved_by             is distinct from old.approved_by
  or new.approved_at             is distinct from old.approved_at
  or new.dv_number               is distinct from old.dv_number
  or new.dv_issued_at            is distinct from old.dv_issued_at
  or new.paid_at                 is distinct from old.paid_at
  or new.check_number            is distinct from old.check_number
  or new.check_photo_id          is distinct from old.check_photo_id
  or new.bir_2307_issued         is distinct from old.bir_2307_issued then
    raise exception 'a supplier may not change the school''s approval or settlement fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger orders_guard_settlement_trg
before update on orders
for each row execute function orders_guard_settlement();

-- ─────────────────────────────────────────────────────────────
-- Storage buckets — private, with per-tenant path prefixes.
-- Path convention: <bucket>/<tenant_id>/<filename>, enforced below so
-- School A can never sign a URL for Supplier B's payment proof.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false),
       ('check-photos', 'check-photos', false),
       ('branding', 'branding', false),
       ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

create policy "payment proofs are supplier-scoped"
on storage.objects for all to authenticated
using (
  bucket_id = 'payment-proofs'
  and (is_owner() or (storage.foldername(name))[1] = auth_supplier_id()::text)
)
with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = auth_supplier_id()::text
);

create policy "check photos are school-scoped"
on storage.objects for all to authenticated
using (
  bucket_id = 'check-photos'
  and (is_owner() or (storage.foldername(name))[1] = auth_school_id()::text)
)
with check (
  bucket_id = 'check-photos'
  and (storage.foldername(name))[1] = auth_school_id()::text
);

create policy "branding is readable by signed-in users, written by owner"
on storage.objects for select to authenticated
using (bucket_id = 'branding');

create policy "branding is written by the platform owner"
on storage.objects for insert to authenticated
with check (bucket_id = 'branding' and is_owner());

create policy "chat attachments follow the order"
on storage.objects for all to authenticated
using (bucket_id = 'chat-attachments' and can_see_order(((storage.foldername(name))[1])::uuid))
with check (bucket_id = 'chat-attachments' and can_see_order(((storage.foldername(name))[1])::uuid));

-- ─────────────────────────────────────────────────────────────
-- Auth wiring — a new auth user gets a profile automatically.
-- Role/tenant come from the invite metadata set by the inviting admin.
-- ─────────────────────────────────────────────────────────────
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role, school_id, supplier_id, position_title)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    -- No default. A missing role in the invite metadata is a bug in the
    -- inviting code, and defaulting it to 'principal' would hand the new
    -- account a school Principal's permissions; fail the insert instead.
    (new.raw_user_meta_data ->> 'role')::user_role,
    nullif(new.raw_user_meta_data ->> 'school_id', '')::uuid,
    nullif(new.raw_user_meta_data ->> 'supplier_id', '')::uuid,
    new.raw_user_meta_data ->> 'position_title'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- Realtime: the order thread streams to both tenants.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_events;
