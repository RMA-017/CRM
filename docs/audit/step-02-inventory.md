# CRM Audit — Step 02 (Project Inventory)

Date: 2026-02-26

## Scope
- Build a concrete map of current codebase (API, Web, DB).
- Identify high-coupling zones and collision-risk areas before refactor.

## Repository Layout

Top-level:
- `api/`
- `web/`
- `docs/`

Package model:
- No root `package.json`.
- Independent packages:
  - `api/package.json`
  - `web/package.json`

## API Inventory (`api/src`)

Main composition:
- [app.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/app.js)
- [index.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/index.js)
- Config: `config/`
- Shared libs: `lib/`
- Feature modules: `modules/`
- Plugins: `plugins/`

Registered route modules:
- `/api/login` -> auth routes
- `/api/meta` -> meta routes
- `/api/profile` -> profile routes
- `/api/users` -> create-user + users routes
- `/api/clients` -> clients routes
- `/api/appointments` -> appointment settings/schedule/breaks/events routes
- `/api/notifications` -> notifications routes
- `/api/settings` -> settings routes

API endpoint matrix (by route file):
- `appointments/appointment-settings.routes.js`
  - `GET /specialists`
  - `GET /client-no-show-summary`
  - `GET /breaks`
  - `PUT /breaks`
  - `GET /events`
  - `GET /schedules`
  - `POST /schedules`
  - `PATCH /schedules/:id`
  - `DELETE /schedules/:id`
  - `GET /settings`
  - `PATCH /settings`
- `auth/auth.routes.js`
  - `POST /`
  - `POST /logout`
- `clients/clients.routes.js`
  - `GET /search`
  - `GET /`
  - `POST /`
  - `PATCH /:id`
  - `DELETE /:id`
- `create-user/create-user.routes.js`
  - `POST /`
- `meta/meta.routes.js`
  - `GET /user-options`
- `notifications/notifications.routes.js`
  - `GET /`
  - `PATCH /read-all`
  - `DELETE /`
  - `POST /send`
- `profile/profile.routes.js`
  - `GET /`
  - `PATCH /`
- `settings/settings.routes.js`
  - Organizations CRUD
  - Admin options get/patch
  - Roles CRUD
  - Positions CRUD
- `users/users.routes.js`
  - `GET /`
  - `PATCH /:id`
  - `DELETE /:id`

Notable module relationships:
- `create-user.routes` and `users.routes` share `/api/users` prefix (no direct path conflict now, but coupled ownership).
- `appointments` routes import notification persistence (`persistNotificationEvent`) and event publishing.
- `settings` routes coordinate appointment settings and global options.

## Web Inventory (`web/src`)

Main composition:
- [App.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/App.jsx)
- [main.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/main.jsx)
- UI pages under `pages/`
- Profile domain concentrated in `pages/profile/`
- Shared API client in [api.js](/c:/Users/user/Desktop/MyFolder/CRM/web/src/lib/api.js)
- Shared UI control: `components/CustomSelect.jsx`

Frontend route map:
- `/` -> Home
- `/profile` -> Profile shell
- Forced profile views via route:
  - users: all/create
  - clients: all/create
  - appointments: schedule/breaks/vip/settings
  - settings: organizations/roles/positions/admin-options/notifications
- Legacy `/profile/...` aliases redirect to current paths.

Main UI architecture:
- [ProfilePage.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/ProfilePage.jsx) = orchestration layer
  - session/profile load
  - SSE subscription
  - notification polling/debounce
  - panel routing state
- [ProfileMainContent.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/ProfileMainContent.jsx) = content renderer by `mainView`
- [ProfileModals.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/ProfileModals.jsx) = all modal UIs
- hooks:
  - `useSettingsSection`
  - `useClientsSection`
  - `useAllUsersSection`
  - `useProfileAccess`
  - `useProfilePanels`

## Database Inventory (`api/database/schema.sql`)

Single schema file (no migration chain currently):
- Core RBAC/settings tables:
  - `role_options`, `permissions`, `role_permissions`, `position_options`, `organizations`
- Identity/user:
  - `users`
- CRM clients:
  - `clients`
- Appointments:
  - `appointment_settings`, `appointment_working_hours`, `appointment_breaks`, `appointment_schedules`
- Notifications/eventing:
  - `user_notifications`, `outbox_events`

Commented-out (not active):
- `appointment_status_history` DDL is present but commented.

## Size / Coupling Hotspots

Largest API files:
- `appointment-settings.routes.js` (~2119 lines)
- `appointment-settings.service.js` (~1285 lines)
- `settings.routes.js` (~720 lines)

Largest Web files:
- `AppointmentScheduler.jsx` (~2201 lines)
- `ProfilePage.jsx` (~1470 lines)
- `ProfileMainContent.jsx` (~1267 lines)
- `ProfileModals.jsx` (~1084 lines)
- `useSettingsSection.js` (~850 lines)

Interpretation:
- These are high-risk edit zones; behavioral collisions are most likely here.
- Refactor in small isolated patches only (already aligned with Step 01 guardrails).

## Inventory Findings (Step 02)

1. Architecture is feature-rich but heavily centralized in a few large files.
2. API is modular by domain, but `/api/users` route ownership is split across two modules.
3. Web profile domain is concentrated in one mega-shell (`ProfilePage`) with many responsibilities.
4. DB has production-critical tables and indexes, but migration lifecycle is not separated from schema.
5. `api/src/modules/audit/` directory exists but is currently empty (stale placeholder).

## Step 02 Exit Criteria
- Module map documented (API/Web/DB).
- Route inventory documented.
- High-coupling areas identified for targeted refactor in next steps.

Status: Completed.

