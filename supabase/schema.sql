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
  'owner', 'principal', 'supplier_owner', 'supplier_employee'
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
  -- A profile belongs to exactly one tenant, except the platform owner.
  constraint profile_tenant_exclusive check (
    (role = 'owner' and school_id is null and supplier_id is null)
    or (role = 'principal' and school_id is not null and supplier_id is null)
    or (role in ('supplier_owner','supplier_employee') and supplier_id is not null and school_id is null)
  )
);

create index on profiles (school_id);
create index on profiles (supplier_id);

-- ─────────────────────────────────────────────────────────────
-- Helper functions — SECURITY DEFINER so policies can read profiles
-- without recursing through profiles' own RLS.
-- ─────────────────────────────────────────────────────────────
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from profiles where id = auth.uid()
$$;

create or replace function auth_supplier_id() returns uuid
language sql stable security definer set search_path = public as $$
  select supplier_id from profiles where id = auth.uid()
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner')
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
  base_cost numeric(12,2) not null check (base_cost >= 0),
  markup_pct numeric(5,2) not null default 0 check (markup_pct >= 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  active boolean not null default true,
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
create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  supplier_id uuid not null references suppliers (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'gcash',
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
  ewt_atc text not null default 'WC158',
  vat_atc text not null default 'WV010',
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

create table print_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  doc_type text not null check (doc_type in ('PR', 'PO', 'IAR', 'DV', 'BIR2307')),
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
alter table tax_config            enable row level security;
alter table branding              enable row level security;
alter table print_templates       enable row level security;

-- profiles: read yourself and your own tenant's staff; owner reads all.
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or is_owner()
  or (school_id is not null and school_id = auth_school_id())
  or (supplier_id is not null and supplier_id = auth_supplier_id())
);
create policy profiles_update_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_owner_write on profiles for all using (is_owner()) with check (is_owner());

-- schools / suppliers
create policy schools_select on schools for select using (is_owner() or id = auth_school_id());
create policy schools_owner_write on schools for all using (is_owner()) with check (is_owner());
create policy schools_self_update on schools for update
  using (id = auth_school_id() and auth_role() = 'principal')
  with check (id = auth_school_id());

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
  school_id = auth_school_id() and auth_role() = 'principal'
);
create policy orders_school_update on orders for update
  using (school_id = auth_school_id())
  with check (school_id = auth_school_id());
create policy orders_supplier_update on orders for update
  using (supplier_id = auth_supplier_id() and status in ('po_issued', 'po_accepted'))
  with check (supplier_id = auth_supplier_id());

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
create policy order_events_all on order_events for all
  using (can_see_order(order_id)) with check (can_see_order(order_id));
create policy messages_all on messages for all
  using (can_see_order(order_id)) with check (can_see_order(order_id));

-- subscription payments: a supplier sees only its own; the owner reviews all.
create policy subs_select on subscription_payments for select using (
  is_owner() or supplier_id = auth_supplier_id()
);
create policy subs_insert on subscription_payments for insert with check (
  supplier_id = auth_supplier_id() and auth_role() = 'supplier_owner'
);
create policy subs_owner_update on subscription_payments for update
  using (is_owner()) with check (is_owner());

-- tax_config is read by everyone, written only by the platform owner.
create policy tax_select on tax_config for select using (auth.uid() is not null);
create policy tax_write on tax_config for all using (is_owner()) with check (is_owner());

create policy branding_select on branding for select using (auth.uid() is not null);
create policy branding_write on branding for all using (is_owner()) with check (is_owner());

create policy templates_select on print_templates for select using (
  is_owner() or school_id = auth_school_id()
);
create policy templates_write on print_templates for all
  using (school_id = auth_school_id() and auth_role() = 'principal')
  with check (school_id = auth_school_id());

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
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'principal'),
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
