-- Initialize wallet_engine database
-- This script runs automatically on first container start

DO $$
BEGIN
    -- Create extensions if needed
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'Extensions already exist, skipping...';
END $$;

-- Create application role
DO $$
BEGIN
    CREATE ROLE wallet_app;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'Role wallet_app already exists';
END $$;

ALTER ROLE wallet_app WITH LOGIN PASSWORD 'walletsecretpassword' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

-- Grant privileges
GRANT CONNECT ON DATABASE wallet_engine TO wallet_app;
GRANT USAGE ON SCHEMA public TO wallet_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wallet_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wallet_app;

-- Create read-only stats role
DO $$
BEGIN
    CREATE ROLE wallet_stats;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'Role wallet_stats already exists';
END $$;

ALTER ROLE wallet_stats WITH LOGIN PASSWORD 'statssecretpassword' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT CONNECT ON DATABASE wallet_engine TO wallet_stats;
GRANT USAGE ON SCHEMA pg_catalog TO wallet_stats;
GRANT SELECT ON ALL TABLES IN SCHEMA pg_catalog TO wallet_stats;

-- Create admin role for PgBouncer admin console
DO $$
BEGIN
    CREATE ROLE wallet_admin WITH LOGIN PASSWORD 'adminsecretpassword' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'Role wallet_admin already exists';
END $$;

GRANT CONNECT ON DATABASE wallet_engine TO wallet_admin;
GRANT admin ON pgbouncer TO wallet_admin;