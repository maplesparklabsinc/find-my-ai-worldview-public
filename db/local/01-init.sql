-- Runs once, when the local Docker database is first created (docker-compose.yml).
--
-- fmaw_dev:  for npm run dev; keeps its data between runs.
-- fmaw_test: for E2E_DB=1 tests, which can wipe it freely.
--
-- The migrations revoke privileges from Supabase's API roles, so those roles
-- exist here too. They can't log in and own nothing.
create role anon nologin;
create role authenticated nologin;

create database fmaw_dev;
create database fmaw_test;
