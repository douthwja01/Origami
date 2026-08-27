-- Data retag runs in scripts/migrate.mjs after this migration commits.
-- Postgres cannot use a new enum value in the same transaction that added it.
SELECT 1;
