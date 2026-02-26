# CRM Audit — Step 08 (P0: API Contract Tests for High-Risk Endpoints)

Date: 2026-02-26

## Scope
- Execute remaining `P0` item from Step 07:
  - add contract tests for high-risk API areas:
    - appointments
    - settings
    - notifications

## Implemented

Added new API contract test suite:
- [route-contracts.test.mjs](/c:/Users/user/Desktop/MyFolder/CRM/api/tests/route-contracts.test.mjs)

What it covers:
1. Stable route contract assertions (method + path):
- `appointments/appointment-settings.routes.js`
- `settings/settings.routes.js`
- `notifications/notifications.routes.js`

2. Route helper contract assertions (input normalization / validation):
- notifications:
  - `parseLimit`
  - `parseUnreadOnly`
  - target user/role normalization
- settings:
  - history lock parsing
  - optional organization parsing
  - permission code parsing
- appointments:
  - integer/boolean parsing
  - schedule scope normalization
  - duration/reminder channel normalization

To make helper contracts testable, explicit exports were added:
- [appointment-settings.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/appointment-settings.routes.js)
  - `__appointmentRouteContracts`
- [settings.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/settings/settings.routes.js)
  - `__settingsRouteContracts`
- [notifications.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/notifications/notifications.routes.js)
  - `__notificationsRouteContracts`

## Verification

Executed after changes:
- `api lint` ✅
- `api test` ✅
- `web lint` ✅
- `web test` ✅

API test count increased:
- before: `4`
- after: `10`

## Notes

- Contract tests intentionally avoid live DB dependency.
- Test bootstrap now sets `JWT_SECRET` in test runtime before importing route modules, because app config enforces required env.

## Step 08 Exit Criteria
- High-risk endpoint contracts are now covered by automated tests.
- CI quality gate (Step 07) can enforce these tests on PR/push.

Status: Completed.

