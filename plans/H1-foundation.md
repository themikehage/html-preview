# H1 — Foundation

**Status**: draft  <!-- draft | approved | done -->
**Objective**: A runnable Bun workspace with a Hono server that answers `/healthz` on both origins, validated config, a real `verify` gate and CI.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- Repo contains only protocol files, `docs/design.md` and plans. No `package.json`, no code, no CI.

---

## Target State (To-Be) — Acceptance Criteria

- [ ] **H1-A1** — `bun install` from a clean clone installs every workspace in one command (`apps/server`, `packages/shared`, `packages/cli` placeholder).
- [ ] **H1-A2** — `bun run dev` starts the server on `PORT`; `GET /healthz` returns `200 {"status":"ok","version":"<pkg version>"}` on both `APP_ORIGIN` and `CONTENT_ORIGIN` hosts.
- [ ] **H1-A3** — Requests are dispatched by `Host`: app host → app router, content host → content router (stub answering 404), unknown host → 421.
- [ ] **H1-A4** — Config is parsed with Zod from env at startup; invalid config exits non-zero with a readable message. In production (`NODE_ENV=production`) the process refuses to start when `APP_ORIGIN` and `CONTENT_ORIGIN` share a host.
- [ ] **H1-A5** — Typed `AppError` hierarchy and a global error handler returning `{ error: { code, message, fix? } }` (schema in `packages/shared`).
- [ ] **H1-A6** — `bun run verify` = `tsc --noEmit` (all workspaces) + `biome check` + `check:size` + `bun test` + build; exits 0.
- [ ] **H1-A7** — `.github/workflows/ci.yml` runs `bun install --frozen-lockfile` and `bun run verify` on push and PR.
- [ ] **H1-A8** — Every new source file carries `// SPDX-License-Identifier: MIT`; `check:license` is part of `verify`.

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

- H1-A1 —
- H1-A2 —
- H1-A3 —
- H1-A4 —
- H1-A5 —
- H1-A6 —
- H1-A7 —
- H1-A8 —

---

## Retro

