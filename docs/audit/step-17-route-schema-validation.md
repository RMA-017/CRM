# CRM Audit — Step 17 (P2: Route-Level Schema Validation)

Date: 2026-02-26

## Scope
- Complete roadmap item:
  - add route-level schema validation gradually
- Applied on high-risk appointments endpoints first.

## Implemented

1. Added reusable appointments route schema catalog:
- [appointment.route-schemas.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/routes/appointment.route-schemas.js)

Includes schemas for:
- schedules query/body/params/scope
- breaks query/body
- settings query/body
- client no-show summary query

2. Wired schemas into route groups:
- [reference.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/routes/reference.routes.js)
- [breaks.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/routes/breaks.routes.js)
- [schedules.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/routes/schedules.routes.js)
- [settings.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/routes/settings.routes.js)

3. Extended contract tests to guard schema wiring:
- [route-contracts.test.mjs](/c:/Users/user/Desktop/MyFolder/CRM/api/tests/route-contracts.test.mjs)

New assertions check that key appointments routes include expected `schema` sections.

## Notes

- Validation layer is intentionally permissive for compatibility, while still enforcing shape/type boundaries.
- Existing route signatures and contracts remain unchanged.

## Verification

Commands executed:
- `pnpm --dir api run lint` ✅
- `pnpm --dir api run test` ✅

## Step 17 Exit Criteria
- Route-level schema validation exists on critical appointments routes.
- Schema wiring is covered by contract tests.
- No regression in lint/tests.

Status: Completed.

