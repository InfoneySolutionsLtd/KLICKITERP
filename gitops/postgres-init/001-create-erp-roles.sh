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

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS license;
CREATE SCHEMA IF NOT EXISTS audit;

GRANT CREATE, USAGE ON SCHEMA app TO kfe_migrate;
GRANT CREATE, USAGE ON SCHEMA license TO kfe_migrate;
GRANT CREATE, USAGE ON SCHEMA audit TO kfe_migrate;
SQL
