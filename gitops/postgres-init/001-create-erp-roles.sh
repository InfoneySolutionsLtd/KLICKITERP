#!/bin/sh
set -eu

: "${DB_PASSWORD:?DB_PASSWORD must be set for the ERP database role}"
: "${DB_MIGRATION_PASSWORD:?DB_MIGRATION_PASSWORD must be set for the migration role}"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$DB_PASSWORD" \
  --set=migration_password="$DB_MIGRATION_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE kfe_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kfe_app')
\gexec

SELECT format('CREATE ROLE kfe_migrate LOGIN PASSWORD %L', :'migration_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kfe_migrate')
\gexec

SELECT format('CREATE ROLE kfe_license LOGIN PASSWORD %L', :'migration_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kfe_license')
\gexec

ALTER ROLE kfe_app PASSWORD :'app_password';
ALTER ROLE kfe_migrate PASSWORD :'migration_password';
ALTER ROLE kfe_license PASSWORD :'migration_password';

-- Migration 0002 re-checks schema creation with CREATE SCHEMA IF NOT EXISTS.
-- PostgreSQL still requires database CREATE for that statement, so grant it
-- to the dedicated migration role rather than the application roles.
SELECT format('GRANT CREATE ON DATABASE %I TO kfe_migrate', current_database())
\gexec

-- Install extensions as the PostgreSQL superuser. TypeORM's migration role
-- should not need database-level CREATE just to run CREATE EXTENSION IF NOT EXISTS.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS license;
CREATE SCHEMA IF NOT EXISTS audit;

-- The migration role owns the schemas so it can manage grants and default
-- privileges during subsequent migrations.
ALTER SCHEMA app OWNER TO kfe_migrate;
ALTER SCHEMA license OWNER TO kfe_migrate;
ALTER SCHEMA audit OWNER TO kfe_migrate;

-- Later migrations temporarily transfer reporting view ownership to these
-- roles, so kfe_migrate must be able to SET ROLE to them.
GRANT kfe_app TO kfe_migrate WITH ADMIN OPTION;
GRANT kfe_license TO kfe_migrate WITH ADMIN OPTION;

GRANT CREATE, USAGE ON SCHEMA app TO kfe_migrate;
GRANT CREATE, USAGE ON SCHEMA license TO kfe_migrate;
GRANT CREATE, USAGE ON SCHEMA audit TO kfe_migrate;
SQL
