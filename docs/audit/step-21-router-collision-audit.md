# CRM Audit — Step 21 (Web/API Router Collision Audit)

Date: 2026-03-09

## Scope
- Rebuild the current web and API route surfaces from tracked code.
- Detect exact route collisions, redirect loops, and redundant alias patterns.
- Apply only low-risk router cleanup when behavior can remain unchanged.

## Route Surface Snapshot

### Web routes
- Source:
  - [web/src/App.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/App.jsx)
- Current route table after cleanup:
  - total route entries: `87`
  - direct page routes: `24`
  - redirect alias routes: `63`
- No redirect cycles were detected in the current `Navigate` chain graph.

### API routes
- Route extraction sources:
  - [api/src/app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js)
  - `api/src/modules/**/**.routes.js`
- Extracted endpoint count: `72`
- No exact method + path collision was detected across the tracked API route modules.

## Findings

### 1) Web route alias sprawl is the main collision risk, not redirect loops (High)
- The app currently carries `63` redirect-only routes for legacy and alternate paths.
- Most of this weight comes from duplicated namespace support such as:
  - `/profile/...`
  - `/appointments/...` legacy aliases
  - `/settings/...` aliases redirecting into canonical destinations

Impact:
- Router ownership is harder to reason about.
- Navigation bugs are more likely during future refactors because one feature can be reachable through several historical paths.

### 2) Case-variant duplicate route patterns were present in the web router (Medium)
- Redundant routes existed for:
  - `/settings/Notification-settings`
  - `/profile/settings/Notification-settings`
- Lowercase equivalents already existed:
  - `/settings/notification-settings`
  - `/profile/settings/notification-settings`

Why this matters:
- React Router path matching is case-insensitive unless explicitly marked otherwise.
- Keeping both variants adds redundant match surface without adding real compatibility.

Implemented cleanup:
- Removed the uppercase duplicate route entries from [web/src/App.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/App.jsx).

Result after cleanup:
- Web route count reduced from `89` to `87`.
- Redirect alias count reduced from `65` to `63`.

### 3) API route ownership is collision-safe today, but a few prefixes are still coupled (Medium)
- No exact runtime collision was found in extracted API endpoints.
- The main ownership tension points are:
  - `/api/users`
    - [api/src/modules/create-user/create-user.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/create-user/create-user.routes.js)
    - [api/src/modules/users/users.routes.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/modules/users/users.routes.js)
  - `/api/appointments`
    - route groups are split, but still depend on shared appointment orchestration and large services

Impact:
- Current behavior is stable.
- Future edits still have elevated collision risk because related endpoints are owned by separate files under the same prefix.

### 4) Canonical route policy is not documented in code (Medium)
- The app has implicit canonical routes, but aliases are encoded manually inside [web/src/App.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/App.jsx).
- There is no single source of truth marking:
  - canonical paths
  - legacy aliases
  - routes planned for deletion

Impact:
- Alias cleanup becomes slower and riskier than necessary.

## Verification

Commands executed after web router cleanup:
- `pnpm.cmd --dir web run lint` equivalent via working directory ✅
- `pnpm.cmd --dir web run test` ✅
- `pnpm.cmd --dir web run build` ✅

Observed build status:
- Build remains green after route cleanup.
- No route-cycle or exact API collision was detected by scripted extraction.

## Recommended Next Steps

### Step 22 — Security/auth hardening audit
- Check auth boundaries, permission enforcement, cookie/cors/jwt settings, and rate limits.

### Step 27 candidate cleanup after hardening
- Introduce a canonical route registry for the frontend.
- Group legacy aliases in one place.
- Remove dead aliases incrementally behind explicit deprecation notes.

## Step 21 Exit Criteria
- Current web/api route surfaces mapped.
- Exact API collisions checked.
- Redirect cycles checked.
- One redundant router collision source removed safely.

Status: Completed.
