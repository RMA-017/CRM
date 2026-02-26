# CRM Audit — Step 13 (P1: Graceful Shutdown & Resource Cleanup)

Date: 2026-02-26

## Scope
- Continue Phase `P1` roadmap item:
  - add graceful shutdown handlers
  - make resource cleanup explicit

## Implemented

Updated:
- [index.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/index.js)
- [app-config.js](/c:/Users/user/Desktop/MyFolder/CRM/api/src/config/app-config.js)

### 1) Process signal/error handlers
Added one-time runtime handlers in bootstrap:
- `SIGINT`
- `SIGTERM`
- `uncaughtException`
- `unhandledRejection`

All handlers route to shared `shutdown()` flow.

### 2) Unified graceful shutdown flow
`shutdown()` now:
- prevents duplicate concurrent shutdown (`isShuttingDown`)
- starts force-exit timeout guard
- closes Fastify app (`app.close()`) to trigger `onClose` hooks
- closes DB pool explicitly (`pool.end()`)
- exits with code:
  - `0` on normal signal shutdown
  - `1` on runtime/startup error

### 3) Configurable shutdown timeout
Added config:
- `appConfig.gracefulShutdownTimeoutMs`
- env: `GRACEFUL_SHUTDOWN_TIMEOUT_MS`
- bounded range: `1000..120000` ms
- default: `10000` ms

## Verification

Commands executed:
- `pnpm --dir api run lint` ✅
- `pnpm --dir api run test` ✅

## Step 13 Exit Criteria
- Graceful process termination handlers exist.
- Runtime and startup errors use unified shutdown path.
- Resource cleanup is explicit (Fastify close + PG pool end).

Status: Completed.

