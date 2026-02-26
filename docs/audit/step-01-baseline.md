# CRM Audit — Step 01 (Baseline & Safety)

Date: 2026-02-26

## Scope
- Freeze current health baseline before deeper refactors.
- Define safety guardrails to prevent UI/logic regressions in next steps.

## Baseline Results

### Workspace state
- Root has no `package.json`; project is split into `web/` and `api/`.
- Git worktree is already dirty (many modified files). No reset/revert applied.

### Quality commands
- `web`: `lint` ✅
- `web`: `test` ✅ (4/4 pass)
- `web`: `build` ✅
- `api`: `lint` ✅
- `api`: `test` ✅ (4/4 pass)

## Critical Smoke Checklist (Manual)

Use this checklist after every high-impact refactor step:

1. Auth flow
- Login success/fail.
- Protected routes redirect behavior.

2. Profile shell
- Header actions, side-menu open/close.
- My profile modal open/edit/save.

3. Users
- All Users table load/pagination.
- Edit User modal (input scroll + static footer actions).
- Create User form save.

4. Clients
- All Clients table load/filter.
- Edit Client modal (input scroll + static footer actions).
- VIP toggle behavior.

5. Appointments
- Scheduler week switch.
- Slot add/edit/delete.
- Conflict guard (occupied slot alert).
- Break cells render and edit.

6. Appointment Settings / Breaks
- Save actions work.
- Reminder day chips render correctly on responsive.

7. Notifications / Messages
- Message panel opens.
- Unread badge + modal list render.

8. Global Settings
- Organizations / Roles / Positions / Admin Options / Notifications screens load.
- Add/Edit/Delete actions complete without UI breakage.

## Safety Guardrails for Next Steps

1. Keep behavior stable
- No business-logic changes unless step explicitly targets logic.
- Refactor order: small patch -> build/test -> next patch.

2. Regression gate per step
- Run:
  - `pnpm --dir web run lint`
  - `pnpm --dir web run test`
  - `pnpm --dir web run build`
  - `pnpm --dir api run lint`
  - `pnpm --dir api run test`

3. Scope isolation
- Do not mix API logic refactor with UI refactor in one patch when avoidable.
- Keep selector, route, and permission changes in separate commits/steps.

4. Rollback readiness
- Keep diffs modular and reviewable.
- Avoid destructive git operations.

## Step 01 Exit Criteria
- Baseline quality checks pass.
- Critical flow checklist defined.
- Safety guardrails documented.

Status: Completed.

