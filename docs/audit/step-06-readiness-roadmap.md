# CRM Audit — Step 06 (Operational Readiness & Execution Roadmap)

Date: 2026-02-26

## Scope
- Consolidate steps 01-05 into a release-readiness snapshot.
- Re-check current quality gates.
- Define a concrete, low-risk execution roadmap for next engineering cycle.

## Current Snapshot (Re-checked)

Quality commands:
- `web lint` ✅
- `web test` ✅ (4/4 pass)
- `web build` ✅
- `api lint` ✅
- `api test` ✅ (4/4 pass)

Build output (`web`):
- JS bundle: `352.02 kB` (`gzip 92.13 kB`)
- CSS bundle: `75.95 kB` (`gzip 12.60 kB`)

Hotspot complexity (still present):
- Web:
  - `AppointmentScheduler.jsx` ~2201 lines
  - `ProfilePage.jsx` ~1470 lines (`13` `useEffect`, `23` `useState`)
- API:
  - `appointment-settings.routes.js` ~2119 lines
  - `appointment-settings.service.js` ~1285 lines

## Findings

### 1) Quality gate exists, but depth is low (High)
- Current lint scripts are syntax/merge-marker checks, not full semantic linting:
  - [web/scripts/lint.mjs](/c:/Users/user/Desktop/MyFolder/CRM/web/scripts/lint.mjs:58)
  - [api/scripts/lint.mjs](/c:/Users/user/Desktop/MyFolder/CRM/api/scripts/lint.mjs:52)
- Contract/integration/e2e tests are missing; only small utility tests exist.

Impact:
- Refactor regressions can pass CI-like checks undetected.

### 2) CI pipeline is absent in repository (High)
- No `.github/workflows`, `.gitlab-ci.yml`, or `Jenkinsfile` found.

Impact:
- No automatic gate for lint/test/build on branch changes.

### 3) Runtime reliability hardening is incomplete (Medium)
- Health endpoint is shallow and does not validate DB connectivity:
  - [app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js:27)
- No process signal handlers for graceful shutdown (`SIGTERM/SIGINT`) detected.
- DB pool close strategy on shutdown is not defined in bootstrap.

Impact:
- Less predictable behavior on deploy restart/termination and partial outages.

### 4) Startup performs write-side permission synchronization (Medium)
- Boot path writes to DB each process start:
  - [app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js:22)
  - [permissions.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/users/permissions.service.js:54)

Impact:
- Startup contention risk in multi-instance deployments.

### 5) Core architecture remains concentrated in mega-files (Medium)
- Large UI/API orchestrators combine multiple responsibilities.

Impact:
- Change collisions remain likely without scoped refactor slicing.

## Consolidated Risk Matrix (After Step 06)

High:
- No migration chain/versioning (Step 05).
- Outbox lifecycle incomplete (write-only) (Step 05).
- No route contract tests / minimal test depth (Step 04 + Step 06).
- No repository CI automation (Step 06).

Medium:
- API error envelope inconsistency (Step 04).
- SSE in-memory fan-out limited for multi-instance scale (Step 04).
- Runtime `information_schema` checks in request path (Step 05).
- Startup permission mutation on boot (Step 05 + Step 06).
- Mega-file coupling hotspots (Step 02 + Step 06).

Low:
- Deployment dependency hardening (`vite` beta channel, `pm2` placement) (Step 03).

## Execution Roadmap (Collision-safe)

Phase P0 — Safety Nets First (1-2 days)
1. Add CI workflow running:
- `web lint/test/build`
- `api lint/test`
2. Add API contract tests for:
- `/api/appointments/schedules`
- `/api/settings/*`
- `/api/notifications/*`
3. Introduce shared web API response normalizer above `apiFetch`.

Phase P1 — Data & Runtime Reliability (2-4 days)
1. Introduce migration framework and baseline schema versioning.
2. Implement outbox worker lifecycle (`pending` -> `sent/failed` + retry + retention).
3. Add readiness endpoint with DB ping.
4. Add graceful shutdown handlers and explicit resource cleanup.

Phase P2 — Structural Refactor (incremental, guarded)
1. Split `ProfilePage.jsx` by domain concerns.
2. Split `appointment-settings.routes.js` into route groups.
3. Split `appointment-settings.service.js` into focused services (settings/schedules/breaks).
4. Add route-level schema validation gradually.

## Release Readiness Verdict

Current state is stable for controlled internal use, but not yet hardened for scaled production operations.

Primary blockers before “production-hardened” status:
1. CI + contract-test coverage.
2. Migration lifecycle.
3. Outbox processing lifecycle.
4. Graceful runtime shutdown/readiness.

## Step 06 Exit Criteria
- End-to-end readiness snapshot documented.
- Cross-step risk matrix consolidated.
- Practical execution plan with safe order defined.

Status: Completed.

