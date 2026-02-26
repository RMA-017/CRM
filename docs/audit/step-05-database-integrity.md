# CRM Audit — Step 05 (Database Integrity, Transactions, Data Lifecycle)

Date: 2026-02-26

## Scope
- Audit DB model quality, referential integrity, and transaction discipline.
- Check query safety and runtime data-lifecycle risks.
- Validate that removed legacy VIP schedule table is no longer referenced.

## Method
- Reviewed:
  - `api/database/schema.sql`
  - `api/src/config/db.js`
  - service-layer SQL in `api/src/modules/**`
- Collected metrics from static scan (tables/indexes/constraints/query usage).

## Key Metrics

Schema:
- Active tables: `13`
- Explicit indexes: `21`
- `REFERENCES` constraints: `30`
- `CHECK` constraints: `25`
- Exclusion constraints: `1`
- Commented legacy tables: `1` (`appointment_status_history`)

Query layer:
- SQL calls (`pool/client/db.query`): `111`
- Transactioned areas found in appointments, settings, users, notifications, permissions modules.
- Dynamic SQL interpolation exists, but values are controlled identifiers/builders (table names/where fragments), not direct request values.

## Findings

### 1) No migration chain/versioning; single schema source of truth (High)
- `api/database` contains only one schema file (`schema.sql`), no migration history/version table.
- Runtime code already compensates for schema drift via column existence checks in appointments settings service:
  - [appointment-settings.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/appointment-settings.service.js:266)
  - [appointment-settings.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/appointment-settings.service.js:1179)

Impact:
- Hard to reproduce exact DB state per environment.
- Drift is handled at runtime instead of deployment-time migration, increasing operational risk.

### 2) Outbox is write-only in current codebase (High)
- Outbox events are inserted:
  - [notifications.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/notifications/notifications.service.js:272)
- No consumer/dispatcher or status transition (`pending` -> `sent`/`failed`) found in API code.

Impact:
- `outbox_events` can grow unbounded.
- “Outbox pattern” durability exists, but delivery lifecycle is incomplete.

### 3) Runtime metadata queries on `information_schema` in request path (Medium)
- Appointment settings functions repeatedly call column-flag discovery:
  - [appointment-settings.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/appointment-settings.service.js:266)
  - [appointment-settings.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/appointment-settings.service.js:1107)
  - [appointment-settings.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/appointment-settings.service.js:1297)

Impact:
- Extra metadata queries on hot paths.
- Schema compatibility is deferred to runtime, not deploy-time.

### 4) Timestamp type is `TIMESTAMP` (without timezone) across core tables (Medium)
- Schema uses `TIMESTAMP` widely (users/clients/appointments/notifications/outbox).
  - Example: [schema.sql](/c:/Users/user/Desktop/MyFolder/CRM/api/database/schema.sql:73)
  - Example: [schema.sql](/c:/Users/user/Desktop/MyFolder/CRM/api/database/schema.sql:283)

Impact:
- Ambiguity across environments/timezones.
- Frontend/SSE timestamps are UTC ISO strings, while DB stores timezone-less values.

### 5) Startup mutates permission data every boot (Medium)
- App startup runs permissions synchronization:
  - [app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js:22)
  - [permissions.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/users/permissions.service.js:54)

Impact:
- Convenient auto-heal, but boot now performs write transactions and legacy cleanup every start.
- In multi-instance deploys this can create unnecessary startup contention.

## Positive Findings

1. Referential integrity for appointment tenant boundaries is strong:
- Composite FK ensures specialist/client belong to same org:
  - [schema.sql](/c:/Users/user/Desktop/MyFolder/CRM/api/database/schema.sql:220)
  - [schema.sql](/c:/Users/user/Desktop/MyFolder/CRM/api/database/schema.sql:223)

2. Concurrency guard for overlapping active schedules is strong:
- Exclusion constraint on appointment time range:
  - [schema.sql](/c:/Users/user/Desktop/MyFolder/CRM/api/database/schema.sql:247)

3. Query safety is generally solid:
- SQL mostly parameterized (`$1`, `$2`, ...), no direct interpolation of user input detected.

4. Legacy VIP schedules table cleanup is complete:
- No `appointment_vip_schedules` references found in project source.

## Recommendations (Safe rollout order)

1. Introduce migration system and schema versioning.
- Keep `schema.sql` as bootstrap, but add forward-only migrations for production changes.

2. Complete outbox lifecycle.
- Add worker/cron to process `outbox_events`, update `status/processed_at/error_message`, and add retention policy.

3. Cache schema capability flags at process level.
- Resolve `information_schema` flags once on startup (or memoize with TTL), not per request path.

4. Decide on timezone policy.
- Prefer `TIMESTAMPTZ` for audit/event timestamps, then normalize read/write boundaries.

5. Move permission seeding to explicit migration/init command.
- Keep startup read-only where possible; run data sync intentionally during deploy.

## Step 05 Exit Criteria
- DB model integrity reviewed.
- Transaction and lifecycle risks identified with concrete file references.
- Non-breaking remediation sequence defined.

Status: Completed.

