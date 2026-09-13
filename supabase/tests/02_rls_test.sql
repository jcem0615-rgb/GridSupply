-- Exercises the tenant boundaries against a real Postgres. Every assertion
-- below is an attack the platform must refuse, or a legitimate action it must
-- allow. Run with: npm run rls
\set ON_ERROR_STOP on
\set QUIET on
\pset pager off
\pset tuples_only on
\pset format unaligned

create schema tests;

-- Become a signed-in end user. PostgREST sets the same GUC from the JWT and
-- connects as `authenticated`; RLS only applies to a role that does not own
-- the tables, so the tests must not run as postgres.
create or replace function tests.as_user(uid uuid) returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  set role authenticated;
end $$;

-- Run a statement and report what happened, so a test can assert on the
-- difference between "refused with an error" and "matched no rows" — RLS
-- blocks a read by returning nothing, and a write by raising.
-- Back to the trusted server-side context: no end user, RLS bypassed because
-- postgres owns the tables. This is what a migration or an admin Edge
-- Function looks like to the guards.
create or replace function tests.as_service() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

create or replace function tests.try(stmt text) returns text
language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return 'ok rows=' || n;
exception when others then
  return 'error ' || sqlstate;
end $$;

create or replace function tests.check(label text, got text, want text) returns void
language plpgsql as $$
begin
  if got = want then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  % — expected [%], got [%]', label, want, got;
  end if;
end $$;

grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

-- ── Fixtures ──────────────────────────────────────────────────────────────
insert into schools (id, name, school_id_number, division) values
  ('11111111-1111-1111-1111-111111111111', 'Bagong Silang ES', 'S-001', 'Caloocan'),
  ('22222222-2222-2222-2222-222222222222', 'Mabini ES',        'S-002', 'Caloocan');

insert into suppliers (id, name) values
  ('33333333-3333-3333-3333-333333333333', 'Tindahan Supplies'),
  ('44444444-4444-4444-4444-444444444444', 'Rival Supplies');

-- Accounts are created through the auth trigger, the way an invite does it.
create or replace function tests.invite(uid uuid, email text, meta jsonb) returns void
language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (uid, email, meta);
$$;

\o /dev/null
select tests.invite('a0000000-0000-0000-0000-000000000001', 'owner@grid.ph',
  '{"role":"owner","full_name":"Platform Owner"}');
select tests.invite('a0000000-0000-0000-0000-000000000002', 'principal1@deped.ph',
  '{"role":"principal","full_name":"Principal One","school_id":"11111111-1111-1111-1111-111111111111"}');
select tests.invite('a0000000-0000-0000-0000-000000000003', 'admin1@deped.ph',
  '{"role":"school_admin","full_name":"Admin One","school_id":"11111111-1111-1111-1111-111111111111"}');
select tests.invite('a0000000-0000-0000-0000-000000000004', 'principal2@deped.ph',
  '{"role":"principal","full_name":"Principal Two","school_id":"22222222-2222-2222-2222-222222222222"}');
select tests.invite('a0000000-0000-0000-0000-000000000005', 'vendor1@mail.ph',
  '{"role":"supplier_owner","full_name":"Vendor One","supplier_id":"33333333-3333-3333-3333-333333333333"}');
select tests.invite('a0000000-0000-0000-0000-000000000006', 'staff1@mail.ph',
  '{"role":"supplier_employee","full_name":"Staff One","supplier_id":"33333333-3333-3333-3333-333333333333"}');
select tests.invite('a0000000-0000-0000-0000-000000000007', 'vendor2@mail.ph',
  '{"role":"supplier_owner","full_name":"Vendor Two","supplier_id":"44444444-4444-4444-4444-444444444444"}');
\o

insert into orders (id, client_uuid, school_id, supplier_id, status, pr_number, po_number, gross_total)
values ('c0000000-0000-0000-0000-000000000001', gen_random_uuid(),
        '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
        'po_issued', 'PR-2026-0001', 'PO-2026-0001', 10000.00);

insert into order_events (id, order_id, actor_id, actor_name, actor_role, status_to)
values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000002', 'Principal One', 'principal', 'po_issued');

with item as (
  insert into catalog_items (supplier_id, name, unit, pack_size, base_cost, markup_pct, selling_price)
  values ('33333333-3333-3333-3333-333333333333', 'Bond paper', 'ream', 500, 200, 20, 240)
  returning id
)
insert into stock_moves (supplier_id, catalog_item_id, qty, balance_after, reason)
select '33333333-3333-3333-3333-333333333333', id, 10, 10, 'received' from item;

\echo ''
\echo '── The invite trigger ────────────────────────────────────────────────'

-- A missing role in the invite metadata used to default to 'principal', which
-- would have handed an unclassified account a school Principal's permissions.
select tests.check('invite with no role is refused',
  tests.try($$select tests.invite('a0000000-0000-0000-0000-0000000000ff', 'nobody@mail.ph', '{"full_name":"No Role"}')$$),
  'error 23502');

\echo ''
\echo '── Privilege escalation on your own profile ──────────────────────────'

select tests.as_user('a0000000-0000-0000-0000-000000000006');  -- supplier employee

select tests.check('an employee cannot make itself the platform owner',
  tests.try($$update profiles set role = 'owner', supplier_id = null where id = auth.uid()$$),
  'error 42501');
select tests.check('an employee cannot promote itself to supplier owner',
  tests.try($$update profiles set role = 'supplier_owner' where id = auth.uid()$$),
  'error 42501');
select tests.check('an employee cannot move itself into a school',
  tests.try($$update profiles set role = 'principal', supplier_id = null,
              school_id = '11111111-1111-1111-1111-111111111111' where id = auth.uid()$$),
  'error 42501');
select tests.as_service();
update profiles set status = 'stopped' where id = 'a0000000-0000-0000-0000-000000000006';
select tests.as_user('a0000000-0000-0000-0000-000000000006');

select tests.check('a stopped account cannot reactivate itself',
  tests.try($$update profiles set status = 'active' where id = auth.uid()$$),
  'error 42501');
select tests.check('and a stopped account reads nothing of its tenant',
  tests.try($$select * from orders$$), 'ok rows=0');
select tests.check('nor its supplier''s catalog',
  tests.try($$select * from catalog_items where supplier_id = '33333333-3333-3333-3333-333333333333'$$),
  'ok rows=0');

select tests.as_service();
update profiles set status = 'active' where id = 'a0000000-0000-0000-0000-000000000006';
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select tests.check('but it can still edit its own name',
  tests.try($$update profiles set full_name = 'Staff One Jr' where id = auth.uid()$$),
  'ok rows=1');

select tests.as_user('a0000000-0000-0000-0000-000000000002');  -- principal
select tests.check('a principal cannot mint a platform owner',
  tests.try($$update profiles set role = 'owner', school_id = null
              where id = 'a0000000-0000-0000-0000-000000000003'$$),
  'error 42501');
select tests.check('a principal can promote its own admin',
  tests.try($$update profiles set role = 'principal'
              where id = 'a0000000-0000-0000-0000-000000000003'$$),
  'ok rows=1');
select tests.check('a principal cannot touch another school''s account',
  tests.try($$update profiles set status = 'stopped'
              where id = 'a0000000-0000-0000-0000-000000000004'$$),
  'ok rows=0');
select tests.check('a principal cannot pull a supplier into its school',
  tests.try($$update profiles set school_id = '11111111-1111-1111-1111-111111111111',
              supplier_id = null, role = 'school_admin'
              where id = 'a0000000-0000-0000-0000-000000000006'$$),
  'ok rows=0');

select tests.as_user('a0000000-0000-0000-0000-000000000005');  -- supplier owner
select tests.check('a supplier owner cannot reset a school principal',
  tests.try($$update profiles set must_change_password = true
              where id = 'a0000000-0000-0000-0000-000000000002'$$),
  'ok rows=0');
select tests.check('a supplier owner administers its own staff',
  tests.try($$update profiles set status = 'paused'
              where id = 'a0000000-0000-0000-0000-000000000006'$$),
  'ok rows=1');

\echo ''
\echo '── What a supplier may do to an order ────────────────────────────────'

select tests.as_user('a0000000-0000-0000-0000-000000000005');
select tests.check('a supplier cannot mark its own order paid',
  tests.try($$update orders set status = 'paid', paid_at = now(), check_number = '000123'
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'error 42501');
select tests.check('a supplier cannot cut itself a cheque',
  tests.try($$update orders set status = 'po_accepted', check_number = '000123'
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'error 42501');
select tests.check('a supplier cannot restate the total',
  tests.try($$update orders set status = 'po_accepted', gross_total = 99000
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'error 42501');
select tests.check('a supplier cannot flip its own VAT status',
  tests.try($$update orders set status = 'po_accepted', supplier_vat_registered = false
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'error 42501');
select tests.check('a supplier cannot issue the voucher',
  tests.try($$update orders set status = 'po_accepted', dv_number = 'DV-1', dv_issued_at = now()
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'error 42501');
select tests.check('a supplier may accept the PO',
  tests.try($$update orders set status = 'po_accepted', accepted_at = now()
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'ok rows=1');
select tests.check('a supplier may dispatch it',
  tests.try($$update orders set status = 'dispatched', dispatched_at = now()
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'ok rows=1');

select tests.as_user('a0000000-0000-0000-0000-000000000007');  -- rival supplier
select tests.check('a rival supplier cannot see the order at all',
  tests.try($$update orders set status = 'po_declined'
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'ok rows=0');

\echo ''
\echo '── The VAT snapshot locks with the voucher ───────────────────────────'

select tests.as_user('a0000000-0000-0000-0000-000000000002');
select tests.check('the school may correct VAT status before the DV',
  tests.try($$update orders set supplier_vat_registered = false
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'ok rows=1');
select tests.check('the school issues the voucher',
  tests.try($$update orders set status = 'dv_issued', dv_number = 'DV-2026-0001', dv_issued_at = now()
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'ok rows=1');
select tests.check('after which VAT status cannot move',
  tests.try($$update orders set supplier_vat_registered = true
              where id = 'c0000000-0000-0000-0000-000000000001'$$),
  'error 42501');

\echo ''
\echo '── The audit trail is append-only ────────────────────────────────────'

select tests.as_user('a0000000-0000-0000-0000-000000000005');
select tests.check('nobody rewrites an order event',
  tests.try($$update order_events set note = 'never happened'
              where id = 'd0000000-0000-0000-0000-000000000001'$$),
  'ok rows=0');
select tests.check('nobody deletes one',
  tests.try($$delete from order_events where id = 'd0000000-0000-0000-0000-000000000001'$$),
  'ok rows=0');
select tests.check('an event cannot be attributed to someone else',
  tests.try($$insert into order_events (order_id, actor_id, actor_name, status_to)
              values ('c0000000-0000-0000-0000-000000000001',
                      'a0000000-0000-0000-0000-000000000002', 'Principal One', 'paid')$$),
  'error 42501');
select tests.check('but a supplier can log its own action',
  tests.try($$insert into order_events (order_id, actor_id, actor_name, actor_role, status_to)
              values ('c0000000-0000-0000-0000-000000000001', auth.uid(), 'Vendor One',
                      'supplier_owner', 'dispatched')$$),
  'ok rows=1');

\echo ''
\echo '── Commercial information stays inside its tenant ────────────────────'

select tests.as_user('a0000000-0000-0000-0000-000000000002');
select tests.check('a school cannot read a supplier''s shelves',
  tests.try($$select * from stock_moves$$), 'ok rows=0');
select tests.check('a school cannot read a supplier''s notes about it',
  tests.try($$select * from supplier_clients$$), 'ok rows=0');

select tests.as_user('a0000000-0000-0000-0000-000000000004');  -- other school
select tests.check('a school cannot read another school''s orders',
  tests.try($$select * from orders where school_id = '11111111-1111-1111-1111-111111111111'$$),
  'ok rows=0');
select tests.check('nor another school''s people',
  tests.try($$select * from profiles where school_id = '11111111-1111-1111-1111-111111111111'$$),
  'ok rows=0');

select tests.as_service();
\echo ''
\echo 'All RLS assertions passed.'
