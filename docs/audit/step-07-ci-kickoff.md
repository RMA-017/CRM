# CRM Audit — Step 07 (P0 Kickoff: CI Quality Gate)

Date: 2026-02-26

## Scope
- Start Phase `P0` from Step 06 roadmap.
- Add repository-level CI gate for core quality checks.

## Implemented

Added GitHub Actions workflow:
- [.github/workflows/quality.yml](/c:/Users/user/Desktop/MyFolder/CRM/.github/workflows/quality.yml)

Workflow behavior:
- Triggers on:
  - `pull_request` (changes in `api/**`, `web/**`, workflow file)
  - `push` to `main`/`master` (same paths)
- Runs 2 isolated jobs:
  - `web-quality`
    - `pnpm install --frozen-lockfile`
    - `pnpm run lint`
    - `pnpm run test`
    - `pnpm run build`
  - `api-quality`
    - `pnpm install --frozen-lockfile`
    - `pnpm run lint`
    - `pnpm run test`

Toolchain in CI:
- `Node.js 22`
- `pnpm 9`
- lockfile-based cache for both packages.

## Verification Snapshot

Local commands re-checked before/around this step:
- `web lint` ✅
- `web test` ✅
- `web build` ✅
- `api lint` ✅
- `api test` ✅

## Why This Step Matters

This closes a major High-risk gap from Step 06:
- Previously there was no automated repository CI.
- Now every relevant PR/push gets mandatory quality execution for both `web` and `api`.

## Remaining P0 Items

1. Add API contract tests for high-risk endpoints:
- `/api/appointments/schedules`
- `/api/settings/*`
- `/api/notifications/*`

2. Add unified frontend API response normalizer above `apiFetch`.

## Step 07 Exit Criteria
- CI workflow exists in-repo.
- Web/API quality gates automated on PR/push paths.

Status: Completed.

