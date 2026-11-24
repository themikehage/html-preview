# H1 — Foundation

**Status**: done  <!-- draft | approved | done -->
**Objective**: A runnable Bun workspace with a Hono server that answers `/healthz` on both origins, validated config, a real `verify` gate and CI.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- Repo contains only protocol files, `docs/design.md` and plans. No `package.json`, no code, no CI.

---

## Target State (To-Be) — Acceptance Criteria

- [x] **H1-A1** — `bun install` from a clean clone installs every workspace in one command (`apps/server`, `packages/shared`, `packages/cli` placeholder).
- [x] **H1-A2** — `bun run dev` starts the server on `PORT`; `GET /healthz` returns `200 {"status":"ok","version":"<pkg version>"}` on both `APP_ORIGIN` and `CONTENT_ORIGIN` hosts.
- [x] **H1-A3** — Requests are dispatched by `Host`: app host → app router, content host → content router (stub answering 404), unknown host → 421.
- [x] **H1-A4** — Config is parsed with Zod from env at startup; invalid config exits non-zero with a readable message. In production (`NODE_ENV=production`) the process refuses to start when `APP_ORIGIN` and `CONTENT_ORIGIN` share a host.
- [x] **H1-A5** — Typed `AppError` hierarchy and a global error handler returning `{ error: { code, message, fix? } }` (schema in `packages/shared`).
- [x] **H1-A6** — `bun run verify` = `tsc --noEmit` (all workspaces) + `biome check` + `check:size` + `bun test` + build; exits 0.
- [x] **H1-A7** — `.github/workflows/ci.yml` runs `bun install --frozen-lockfile` and `bun run verify` on push and PR.
- [x] **H1-A8** — Every new source file carries `// SPDX-License-Identifier: MIT`; `check:license` is part of `verify`.

---

## Artifacts

### 1. NEW `package.json`, `bunfig.toml`, `tsconfig.base.json`, `biome.json`

Root workspace (`apps/*`, `packages/*`), scripts `dev`, `verify`, `typecheck`, `lint`, `check:size`, `check:license`, `test`, `build`. TypeScript `strict`, `noUncheckedIndexedAccess`.

### 2. NEW `apps/server/src/index.ts` (≤ 60 lines)

`Bun.serve` entry: load config, build server context, dispatch by host.

### 3. NEW `apps/server/src/core/infra/config.ts`, `errors.ts`, `server-context.ts`, `host-dispatch.ts`

- `loadConfig(env)`: Zod schema for the variables in `about.md`.
- `AppError` + subclasses (`BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `PayloadTooLarge`, `TooManyRequests`).
- `createServerContext(config)`: empty context for now; later milestones add ports.
- `dispatchByHost(req, apps)`.

### 4. NEW `packages/shared/src/errors.ts`, `health.ts`, `index.ts`

`ErrorBody` and `Health` schemas.

### 5. NEW `scripts/check-size.ts`, `scripts/check-license.ts`

### 6. NEW `.github/workflows/ci.yml`

---

## Non-Negotiable Constraints

1. No domain logic, storage or routes beyond `/healthz` — **not touched in this milestone**.
2. Zero `any` in new code.
3. New files ≤ 300 lines.
4. Conventional commit after completion.

---

## Verification

```bash
bun run verify
# -> exit code 0
```

Behavior check: `bun run dev` then `curl -H 'Host: localhost:3000' :3000/healthz` and `curl -H 'Host: 127.0.0.1:3000' :3000/healthz` (dev defaults for the two origins); `curl -H 'Host: evil.test' :3000/healthz` → 421; start with `NODE_ENV=production APP_ORIGIN=https://a.x CONTENT_ORIGIN=https://a.x` → non-zero exit.

---

## Evidence

- H1-A1 — `bun install` on a clean copy (tracked+untracked files, no node_modules) installs all 3 workspaces, `--frozen-lockfile` OK.
- H1-A2 — Server on :3999 → `GET /healthz` = `200 {"status":"ok","version":"0.0.0"}` with Host `localhost:3999` and `127.0.0.1:3999`. `bun run dev` boots (port 3000 is taken by the-spaces on this host; use `PORT`).
- H1-A3 — Content host `/x` → 404 `not_found`; `Host: evil.test` → `421 unknown_host` with `fix`. Covered by `server.test.ts`.
- H1-A4 — `PORT=abc` → readable message, exit 1. `NODE_ENV=production` with same-host origins → exit 1. Covered by `config.test.ts`.
- H1-A5 — `AppError` hierarchy in `errors.ts`; handler returns `{error:{code,message,fix?}}`, parsed against `ErrorBody` from `packages/shared` in tests.
- H1-A6 — `bun run verify` exit 0 (tsc, biome, check:size, check:license, 11 tests, build), also on a clean copy.
- H1-A7 — `.github/workflows/ci.yml` added (frozen install + verify). No git remote yet, so no GitHub run observed; same steps pass locally on a clean copy.
- H1-A8 — `check:license` in `verify`; fails if any `.ts` lacks the SPDX first line (it caught `server.ts` once).

---

## Retro Biome's import sorter pulls the SPDX header below imports unless a blank line follows it; a stray process on `:3000` (the-spaces) made dev checks hit the wrong server, so use another `PORT` and never `pkill -f` a pattern present in your own command.
