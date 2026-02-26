# CRM Audit — Step 03 (Dependencies & Import Graph)

Date: 2026-02-26

## Scope
- Verify declared dependencies vs real usage.
- Validate import graph health (deep relative paths, unresolved imports, cycles).
- Flag package-level risks that can break deploy/runtime.

## Method

Checked:
- `web/package.json`, `api/package.json`
- `web/src/**`, `api/src/**` import graph scan
- script/config usage for `vite` and `pm2`

## Findings

### 1) Dependency usage coverage

Web:
- Declared runtime deps: `react`, `react-dom`, `react-router-dom`
- Declared dev deps: `vite`
- Result: all runtime deps are used in source; `vite` is used by scripts/config.

API:
- Declared runtime deps: `@fastify/*`, `argon2`, `fastify`, `jsonwebtoken`, `pg`
- Declared dev deps: `pm2`
- Result: all runtime deps are used in source.
- `pm2` is used via npm scripts (`pm2:start`, `pm2:reload`, etc.), not imported in source (expected for CLI tooling).

### 2) Import graph health

Web (`web/src`):
- Files scanned: `21`
- Import/require statements: `59`
- Deep relative imports (`../../../` or deeper): `0`
- Unresolved relative imports: `0`
- Circular dependencies detected: `0`

API (`api/src`):
- Files scanned: `34`
- Import/require statements: `109`
- Deep relative imports (`../../../` or deeper): `0`
- Unresolved relative imports: `0`
- Circular dependencies detected: `0`

### 3) Boundary checks

- Cross-package path leakage (`web` importing `api` internals or reverse): not found.
- Absolute filesystem import specifiers: not found.
- Dynamic `import()` usage: not found.
- `require()` usage: not found (project is clean ESM style).

## Risk Notes

1. `web` uses `vite@^8.0.0-beta.13` (beta channel).
- Risk: toolchain instability/regressions between beta updates.
- Recommendation: move to stable Vite when possible.

2. `api` keeps `pm2` in `devDependencies` while production scripts depend on it.
- Risk: if deployment installs with production-only dependencies, local `pm2` binary may be missing.
- Recommendation: either:
  - keep `pm2` installed globally in runtime environment and document this, or
  - move `pm2` to `dependencies` if project expects local package binary in production.

## Conclusion

Step 03 is clean from import/dependency collision perspective:
- no unused runtime dependencies,
- no import cycles,
- no deep-relative path smell,
- no unresolved imports.

Remaining actions are deployment-hardening decisions (`vite` stability channel, `pm2` install strategy), not urgent refactor blockers.

## Step 03 Exit Criteria
- Dependency declaration vs usage reviewed.
- Import graph integrity validated.
- Deployment-related dependency risks documented.

Status: Completed.

