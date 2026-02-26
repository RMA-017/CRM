# CRM Audit — Step 10 (P1: Migration Framework Foundation)

Date: 2026-02-26

## Scope
- Start Phase `P1` from roadmap:
  - introduce migration framework
  - establish baseline schema version marker

## Implemented

1. Added migration runner:
- [migrate.mjs](/c:/Users/user/Desktop/MyFolder/CRM/api/scripts/migrate.mjs)

Core behavior:
- auto-creates `schema_migrations` table (if missing)
- loads SQL files from `api/database/migrations`
- computes SHA-256 checksum per migration file
- validates checksum for already applied migrations
- supports:
  - apply mode: `pnpm --dir api run migrate`
  - status mode: `pnpm --dir api run migrate:status`

2. Added baseline migration file:
- [20260226_000001_baseline.sql](/c:/Users/user/Desktop/MyFolder/CRM/api/database/migrations/20260226_000001_baseline.sql)

3. Added package scripts:
- [package.json](/c:/Users/user/Desktop/MyFolder/CRM/api/package.json)
  - `migrate`
  - `migrate:status`

## Verification

Commands executed:
- `api lint` ✅
- `api test` ✅
- `web test` ✅
- `api migrate:status` ✅

Status output:
- `PENDING 20260226_000001_baseline.sql`
- total `1`, pending `1`

## Notes

- Migration apply (`migrate`) was not auto-run in this step to avoid unexpected DB mutation.
- Current `schema.sql` remains as bootstrap source; migration chain is now ready for forward changes.

## Step 10 Exit Criteria
- Migration engine exists and is runnable.
- Baseline version file exists.
- Migration status can be inspected from CLI.

Status: Completed.

