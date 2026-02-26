# CRM Audit — Step 12 (P1: Readiness Endpoint with DB Ping)

Date: 2026-02-26

## Scope
- Continue Phase `P1` roadmap item:
  - add readiness endpoint with real database check

## Implemented

Updated:
- [app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js)

Changes:
1. Kept `/health` as liveness endpoint.
2. Added `checkDatabaseReadiness()` helper (`SELECT 1 AS ok`).
3. Added `/ready` endpoint:
- returns `status: "ready"` when:
  - DB ping is `up`
  - outbox worker is `up` (or worker is `disabled`)
- returns HTTP `503` with `status: "not-ready"` when dependency check fails
- includes `checks` payload:
  - `database`: `up|down`
  - `outboxWorker`: `up|down|disabled`
- includes `timestamp`
- includes compact DB error details when DB is down

## Verification

Commands executed:
- `pnpm --dir api run lint` ✅
- `pnpm --dir api run test` ✅

## Step 12 Exit Criteria
- Readiness endpoint exists and checks DB reachability.
- Liveness and readiness are separated (`/health` vs `/ready`).
- Worker runtime state is reflected in readiness output.

Status: Completed.

