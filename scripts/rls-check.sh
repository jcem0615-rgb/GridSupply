#!/usr/bin/env bash
# Applies supabase/schema.sql to a throwaway Postgres and runs the RLS suite.
# The policies are the only thing separating one school's purchase orders from
# another's, so they are worth executing rather than reading.
set -euo pipefail

PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
if [ -z "${PGBIN:-}" ]; then
  echo "No local PostgreSQL found. Install postgresql (e.g. apt-get install postgresql-16)." >&2
  exit 1
fi

ROOT=$(cd "$(dirname "$0")/.." && pwd)
RUN=${PGRLS_DIR:-/var/tmp/gridsupply-rls}
PSQL_USER=${PGRLS_USER:-postgres}

# initdb refuses to run as root, so the cluster is owned by the postgres user.
as_pg() { if [ "$(id -u)" = 0 ]; then su "$PSQL_USER" -c "$1"; else bash -c "$1"; fi; }

rm -rf "$RUN"; mkdir -p "$RUN"
cp -r "$ROOT/supabase" "$RUN/sb"
chmod -R a+rX "$RUN"
if [ "$(id -u)" = 0 ]; then chown -R "$PSQL_USER" "$RUN"; fi

as_pg "$PGBIN/initdb -D $RUN/data -U postgres -A trust" >/dev/null 2>&1
as_pg "$PGBIN/pg_ctl -D $RUN/data -o '-k $RUN -c listen_addresses=\"\"' -l $RUN/log start" >/dev/null
trap 'as_pg "$PGBIN/pg_ctl -D $RUN/data -m immediate stop" >/dev/null 2>&1 || true' EXIT

P="$PGBIN/psql -h $RUN -U postgres -d gs -q -v ON_ERROR_STOP=1"
as_pg "$PGBIN/psql -h $RUN -U postgres -tAc 'create database gs;'" >/dev/null
as_pg "$P -f $RUN/sb/tests/00_shim.sql" 2>&1 | grep -v 'wal_level\|HINT' || true
as_pg "$P -f $RUN/sb/schema.sql"
echo "schema applies cleanly"
as_pg "$P -f $RUN/sb/tests/01_grants.sql"
as_pg "$PGBIN/psql -h $RUN -U postgres -d gs -v ON_ERROR_STOP=1 -f $RUN/sb/tests/02_rls_test.sql" 2>&1 | sed 's/^NOTICE:  //'
