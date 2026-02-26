# CRM Audit — Step 09 (P0: Web API Response Normalizer)

Date: 2026-02-26

## Scope
- Finish remaining `P0` item from Step 08:
  - introduce unified frontend API response normalizer above `apiFetch`.

## Implemented

Updated API utility layer:
- [api.js](/c:/Users/user/Desktop/MyFolder/CRM/web/src/lib/api.js)

Added shared helpers:
1. `readApiResponseData(response)`
- Safe payload parsing for JSON/text/no-content responses.
- Keeps callers away from repeated `response.json().catch(() => ({}))`.

2. `normalizeApiError(response, data, fallbackMessage)`
- Standardizes error shape:
  - `status`
  - `message`
  - `field`
  - `errors`
  - `code`

3. `getApiErrorMessage(response, data, fallbackMessage)`
- Uniform message selection for UI error display.

Integrated `readApiResponseData` in primary web modules:
- [ProfilePage.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/ProfilePage.jsx)
- [HomePage.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/HomePage.jsx)
- [AppointmentScheduler.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/AppointmentScheduler.jsx)
- [AppointmentSettingsPanel.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/AppointmentSettingsPanel.jsx)
- [useClientsSection.js](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/useClientsSection.js)
- [useAllUsersSection.js](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/useAllUsersSection.js)
- [useSettingsSection.js](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/profile/useSettingsSection.js)

Also wired `getApiErrorMessage` in key login/profile/notification flows:
- [HomePage.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/HomePage.jsx)
- [ProfilePage.jsx](/c:/Users/user/Desktop/MyFolder/CRM/web/src/pages/ProfilePage.jsx)

## Test Coverage Added

New web helper tests:
- [api.test.mjs](/c:/Users/user/Desktop/MyFolder/CRM/web/tests/api.test.mjs)

Covers:
- JSON parsing
- text fallback parsing
- 204/no-content behavior
- normalized error message behavior

## Verification

Executed after changes:
- `web lint` ✅
- `web test` ✅ (`9/9`)
- `web build` ✅
- `api lint` ✅
- `api test` ✅ (`10/10`)

Normalizer impact metric:
- direct `response.json().catch(() => ({}))` in `web/src`:
  - before (Step 04 snapshot): `41`
  - now: `1` (only inside shared helper)

## Step 09 Exit Criteria
- Shared response normalizer exists above transport layer.
- Repeated JSON parsing fallback logic is centralized.
- Core views/hooks now consume normalized response reader.

Status: Completed.

