# CRM Audit — Step 19 (Hardening: Startup Permissions Sync for Multi-Instance)

Date: 2026-02-26

## Scope
- Production hardening for startup write path:
  - reduce collision risk when multiple API instances boot simultaneously
  - make permissions sync behavior configurable

## Implemented

1. Added advisory-lock based startup sync protection:
- [permissions.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/users/permissions.service.js)

Changes:
- `ensureSystemPermissions(options)` now supports:
  - `useAdvisoryLock`
  - `advisoryLockKey`
  - `skipIfLockUnavailable`
  - `logger`
- Uses `pg_try_advisory_xact_lock(...)` inside transaction.
- If lock is unavailable and skip mode is enabled:
  - transaction is rolled back
  - sync is skipped safely
  - startup can continue without contention failure

2. Added startup config for permission sync:
- [app-config.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/config/app-config.js)

New env flags:
- `PERMISSIONS_SYNC_ON_STARTUP` (default: `true`)
- `PERMISSIONS_SYNC_USE_ADVISORY_LOCK` (default: `true`)
- `PERMISSIONS_SYNC_LOCK_KEY` (default: `41003001`)
- `PERMISSIONS_SYNC_SKIP_IF_LOCKED` (default: `true`)

3. Wired config-driven startup flow:
- [app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js)

Behavior:
- when enabled, runs permissions sync with advisory lock options
- logs when sync is skipped due to lock
- allows fully disabling startup sync via config

## Verification

Commands executed:
- `pnpm --dir api run lint` ✅
- `pnpm --dir api run test` ✅

## Step 19 Exit Criteria
- Startup permission sync is safer under multi-instance deploy.
- Behavior is configurable without code changes.
- Existing route contracts/tests remain green.

Status: Completed.

