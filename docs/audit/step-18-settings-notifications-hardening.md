# CRM Audit — Step 18 (Hardening: Settings/Notifications Validation + Error Shape)

Date: 2026-02-26

## Scope
- Extend route-level schema validation beyond appointments:
  - settings routes
  - notifications routes
- Normalize validation/not-found error response shape.

## Implemented

1. Added settings route schema catalog:
- [settings.route-schemas.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/settings/settings.route-schemas.js)

2. Added notifications route schema catalog:
- [notifications.route-schemas.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/notifications/notifications.route-schemas.js)

3. Wired schemas into routes:
- [settings.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/settings/settings.routes.js)
- [notifications.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/notifications/notifications.routes.js)

4. Added app-level validation error normalization:
- [app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js)

Behavior:
- AJV/Fastify validation errors now return:
  - `code: "VALIDATION_ERROR"`
  - `message`
  - `field`
  - `errors[]`

5. Unified not-found payload shape:
- `404` now returns `{ "message": "Not Found." }` (JSON) instead of plain text.

6. Extended API contract tests for schema wiring:
- [route-contracts.test.mjs](/c:/Users/user/Desktop/MyFolder/CRM/api/tests/route-contracts.test.mjs)

## Verification

Commands executed:
- `pnpm --dir api run lint` ✅
- `pnpm --dir api run test` ✅

## Step 18 Exit Criteria
- Settings/notifications critical endpoints have route schemas.
- Validation errors use consistent API envelope.
- Contract tests still pass.

Status: Completed.

