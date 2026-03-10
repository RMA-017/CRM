# CRM Audit — Step 20 (Re-Baseline & Audit Drift Check)

Date: 2026-03-09

## Scope
- Re-check the current repository instead of assuming the February 26, 2026 audit snapshot is still accurate.
- Verify active quality gates.
- Identify drift between existing audit docs and the actual tracked codebase before starting production-hardening fixes.

## Current Snapshot

### Workspace state
- Git worktree is dirty.
- Modified files are concentrated in active frontend shell files:
  - [web/src/App.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/App.jsx)
  - [web/src/pages/ProfilePage.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/ProfilePage.jsx)
  - [web/src/pages/profile/ProfileMainContent.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/ProfileMainContent.jsx)
  - [web/src/pages/profile/ProfileModals.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/ProfileModals.jsx)
  - [web/src/pages/profile/ProfileSideMenu.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/ProfileSideMenu.jsx)

### Quality gates re-checked
- `web`: `lint` ✅
- `web`: `test` ✅ (15/15 pass)
- `web`: `build` ✅
- `api`: `lint` ✅
- `api`: `test` ✅ (15/15 pass)

Environment note:
- On this Windows machine, direct `pnpm` invocation was blocked by PowerShell execution policy (`pnpm.ps1`).
- Commands succeeded through `pnpm.cmd`.
- This is a local shell caveat, not a repo failure.

### CI status
- `.github/workflows/quality.yml` exists and runs:
  - `web`: install, lint, test, build
  - `api`: install, lint, test

This means the older Step 06 finding "CI pipeline is absent" is no longer accurate.

### Current build snapshot
- `web` build output:
  - CSS: `151.32 kB` (`gzip 22.92 kB`)
  - main JS: `174.84 kB` (`gzip 55.42 kB`)
  - `ProfilePage` chunk: `408.11 kB` (`gzip 86.04 kB`)

### Current hotspot sizes
- [web/src/pages/ProfilePage.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/ProfilePage.jsx): `2821` lines
- [web/src/pages/profile/ProfileMainContent.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/ProfileMainContent.jsx): `4534` lines
- [web/src/pages/profile/AppointmentScheduler.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/AppointmentScheduler.jsx): `3369` lines
- [api/src/modules/appointments/routes/schedules.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/routes/schedules.routes.js): `1190` lines
- [api/src/modules/appointments/appointment-settings.service.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/appointment-settings.service.js): `2532` lines

## Audit Drift Findings

### 1) Migration framework documentation does not match tracked repository state (High)
- [api/scripts/migrate.mjs](/c:/Users/user/Desktop/MyFolder/CRM/api/scripts/migrate.mjs) expects SQL files under `api/database/migrations`.
- The tracked repository currently contains only:
  - [api/database/schema.sql](/c:/Users/user/Desktop/MyFolder/CRM/api/database/schema.sql)
- `git ls-files api/database` shows no `migrations/` directory or baseline SQL migration files.
- Existing audit docs still reference missing files:
  - [docs/audit/step-10-migrations-foundation.md](/c:/Users/user/Desktop/MyFolder/CRM/docs/audit/step-10-migrations-foundation.md)
  - [docs/audit/step-11-outbox-worker-lifecycle.md](/c:/Users/user/Desktop/MyFolder/CRM/docs/audit/step-11-outbox-worker-lifecycle.md)

Impact:
- Production migration flow is not trustworthy until tracked migration artifacts are restored or the docs are corrected.

### 2) Previous readiness snapshot contains stale conclusions (Medium)
- [docs/audit/step-06-readiness-roadmap.md](/c:/Users/user/Desktop/MyFolder/CRM/docs/audit/step-06-readiness-roadmap.md) says CI is absent.
- Current repo includes [quality.yml](/c:/Users/user/Desktop/MyFolder/CRM/.github/workflows/quality.yml).
- Step 02 route inventory is also stale relative to current appointments contract coverage, which now includes work-schedule and report endpoints.

Impact:
- Release planning based on old findings can send effort to already-solved problems while missing current blockers.

### 3) Quality gates exist, but depth is still shallow (High)
- Current lint scripts are custom file scans, not semantic linting.
- Automated tests are still mostly utility and route-contract tests.
- No DB-backed integration suite or browser-level end-to-end regression suite is present in tracked code.

Impact:
- Business-logic regressions, query bugs, permission leaks, and UI flow regressions can still pass current CI.

### 4) Frontend collision risk remains high in core orchestration files (High)
- The dirty worktree is inside the same profile-shell files that already represent the largest frontend hotspots.
- `ProfilePage` / `ProfileMainContent` / modal orchestration remain concentrated and expensive to change safely.

Impact:
- Audit fixes touching routing, permissions, modals, notifications, or profile-shell navigation are likely to collide unless sliced carefully.

### 5) Production performance budget needs a fresh pass (Medium)
- Current `web` bundle snapshot is materially larger than the old February 26, 2026 snapshot.
- The biggest concern is the lazy-loaded `ProfilePage` chunk size.

Impact:
- Initial dashboard/profile load and repeat navigations are likely carrying unnecessary JS/CSS weight into production.

## Re-Baselined Risk Matrix

High:
- Migration/doc drift around production schema lifecycle.
- Shallow automated regression depth.
- Frontend hotspot collision risk in profile-shell files.

Medium:
- Stale audit documents can mislead execution order.
- Bundle growth on the main profile path.
- Route inventory and ownership map need refresh before router conflict cleanup.

Low:
- Local PowerShell `pnpm.ps1` policy issue; workaround exists via `pnpm.cmd`.

## Step Sequencing After Re-Baseline

### Step 21 — Router collision audit
- Rebuild complete web/app route map.
- Rebuild API endpoint matrix from current code.
- Identify shadow routes, duplicate aliases, prefix conflicts, and redirect loops.

### Step 22 — Security/auth hardening audit
- Verify cookie, CORS, JWT, rate-limit, and permission enforcement.
- Check auth-required boundaries and startup write-path behavior.

### Step 23 — Validation/error-contract expansion
- Extend route schema coverage.
- Normalize remaining API error envelopes.
- Add missing negative-path tests.

### Step 24 — Migration integrity repair
- Restore or recreate tracked migration chain.
- Reconcile `schema.sql`, migration runner expectations, and release procedure.

## Step 20 Exit Criteria
- Current repo health re-checked.
- Audit-document drift identified explicitly.
- Next production-hardening steps prioritized from current facts, not stale notes.

Status: Completed.
