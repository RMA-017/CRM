# CRM Audit — Step 04 (API Contracts, Validation, Error Handling)

Date: 2026-02-26

## Scope
- Review API contract consistency between `api` and `web`.
- Check validation strategy, error envelope consistency, and SSE delivery behavior.
- Identify high-collision areas before deeper refactor.

## Method
- Static scan of API routes and web API consumers.
- Contract-shape metrics (status codes, error keys, parsing patterns).
- Targeted read of SSE and notification flow.

## Key Metrics

API:
- Route files scanned: `9`
- Route definitions: `43`
- Fastify `schema` blocks: `0`
- `reply.status(...).send(...)` counts:
  - `201`: 9
  - `400`: 82
  - `401`: 21
  - `403`: 25
  - `404`: 24
  - `409`: 24
  - `500`: 47
- Top files by explicit status-send usage:
  - `appointments/appointment-settings.routes.js`: 71
  - `settings/settings.routes.js`: 66

Web:
- `apiFetch` calls: `46`
- `!response.ok` checks: `40`
- `response.json().catch(() => ({}))` patterns: `41`
- `handleProtectedStatus(...)` usage: `26`
- `window.alert(...)` for API outcomes: `17`

## Findings

### 1) No shared route schema layer (Medium)
- API routes do manual parsing/validation in handlers; Fastify schema validation is not used.
- This increases drift risk between endpoint expectations and frontend payloads as files grow.
- Example: large manual validators in:
  - `api/src/modules/appointments/appointment-settings.routes.js`
  - `api/src/modules/settings/settings.routes.js`

### 2) Error envelope is not fully uniform (Medium)
- Multiple response shapes are used (`{ message }`, `{ field, message }`, `{ errors }`, direct validation objects).
- Unauthorized wording is inconsistent:
  - `"Unauthorized"` in [session.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/lib/session.js:20)
  - `"Unauthorized."` in route files (for example notifications/settings/clients).
- `404` fallback returns plain text instead of JSON:
  - [app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js:46)

Impact:
- Frontend must implement many ad-hoc parsers and fallbacks.

### 3) Frontend duplicates API parsing/error logic broadly (Medium)
- `apiFetch` is transport-only and does not normalize errors:
  - [api.js](/c:/Users/user/Desktop/MyFolder/CRM/web/src/lib/api.js:12)
- Parsing/error handling is repeated across hooks/components (41 `json().catch` occurrences).
- Central redirect helper treats `403` and `404` the same:
  - [profile.helpers.js](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/profile.helpers.js:115)

Impact:
- High maintenance cost and behavior drift risk between panels.

### 4) SSE path is functional but contract is fragile (Medium)
- SSE endpoint manually handles CORS and hijacks response:
  - [appointment-settings.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/appointment-settings.routes.js:1208)
- Event fan-out is in-memory (`Map` in one process):
  - [appointment-events.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/appointments/appointment-events.js:1)

Impact:
- Works on single-instance runtime.
- In multi-instance/process deployments, cross-instance delivery is not guaranteed without shared broker.

### 5) Contract-level automated tests are minimal (High)
- API tests: only `api/tests/lib.test.mjs`.
- Web tests: only `web/tests/formatters.test.mjs`.
- No route-level contract tests for appointments/settings/notifications.

Impact:
- High regression probability as refactor proceeds.

## Recommendations (Non-breaking, next steps)

1. Introduce a shared API error envelope standard:
- Minimum: `{ message, field?, errors?, code? }` across all modules.

2. Add a thin web API helper above `apiFetch`:
- Parse JSON safely once.
- Normalize non-OK payload to a unified `{ status, message, field, errors }`.

3. Keep behavior, reduce drift:
- Normalize `"Unauthorized"` message formatting (with or without period, choose one).
- Return JSON in not-found handler instead of plain text.

4. Add contract tests before deep refactor:
- Start with high-risk endpoints:
  - `/api/appointments/schedules` (POST/PATCH/DELETE)
  - `/api/settings/*`
  - `/api/notifications/*`

5. Plan SSE scalability path:
- If multi-instance deployment is expected, move event fan-out behind shared broker (e.g. Redis pub/sub) while keeping current payload contract.

## Step 04 Exit Criteria
- API contract consistency reviewed.
- Validation/error-handling gaps documented with concrete hotspots.
- Refactor-safe recommendations defined.

Status: Completed.

