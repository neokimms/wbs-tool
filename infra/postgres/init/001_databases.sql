SELECT 'CREATE DATABASE openproject OWNER ' || quote_ident(current_user)
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'openproject'
)\gexec

\connect openproject
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
