# CRM Audit — Step 11 (P1: Outbox Worker Lifecycle)

Date: 2026-02-26

## Scope
- Continue Phase `P1` from roadmap:
  - implement outbox processing lifecycle
  - add retry + retention behavior
  - wire worker into app runtime

## Implemented

1. Added outbox worker module:
- [outbox.worker.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/notifications/outbox.worker.js)

Behavior:
- periodic polling (`OUTBOX_WORKER_POLL_MS`)
- processes pending events in batches
- retries failed processing with delay (`OUTBOX_WORKER_RETRY_DELAY_SECONDS`)
- finalizes as `failed` after max retries
- runs retention cleanup every configurable N cycles

2. Enhanced outbox processing service:
- [notifications.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/notifications/notifications.service.js)

Changes:
- `insertOutboxEvent` now supports `maxRetries`
- `processPendingOutboxEvents` now:
  - respects `next_retry_at`
  - tracks `retry_count`
  - requeues transient failures
  - marks terminal failures as `failed`
- adds `requeuedCount` metric in processing result

3. Added worker config:
- [app-config.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/config/app-config.js)

New env-backed settings:
- `OUTBOX_WORKER_ENABLED`
- `OUTBOX_WORKER_POLL_MS`
- `OUTBOX_WORKER_PROCESS_LIMIT`
- `OUTBOX_WORKER_RETRY_DELAY_SECONDS`
- `OUTBOX_WORKER_RETENTION_DAYS`
- `OUTBOX_WORKER_RETENTION_LIMIT`
- `OUTBOX_WORKER_RETENTION_EVERY_CYCLES`

4. Wired worker into app lifecycle:
- [app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js)

Lifecycle:
- start on app ready
- stop on app close

5. Added DB migration for retry lifecycle:
- [20260226_000002_outbox_retry_lifecycle.sql](/c:/Users/user/Desktop/MyFolder/CRM/api/database/migrations/20260226_000002_outbox_retry_lifecycle.sql)

DB changes:
- `outbox_events.retry_count`
- `outbox_events.max_retries`
- `outbox_events.next_retry_at`
- `idx_outbox_events_pending_retry` index

6. Synced bootstrap schema:
- [schema.sql](/c:/Users/user/Desktop/MyFolder/CRM/api/database/schema.sql)

## Verification

Commands executed:
- `pnpm --dir api run lint` ✅
- `pnpm --dir api run test` ✅
- `pnpm --dir api run migrate` ✅
- `pnpm --dir api run migrate:status` ✅

Migration status:
- `APPLIED 20260226_000001_baseline.sql`
- `APPLIED 20260226_000002_outbox_retry_lifecycle.sql`
- pending: `0`

## Step 11 Exit Criteria
- Outbox is no longer write-only.
- Pending events are processed with retry/fail states.
- Processed events are prunable via retention cycle.
- Worker is attached to runtime lifecycle and configurable by env.

Status: Completed.

