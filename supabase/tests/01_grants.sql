-- PostgREST reaches the tables as `authenticated`; RLS only bites for a role
-- that is not the table owner, so the tests must not run as postgres.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema storage to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;
