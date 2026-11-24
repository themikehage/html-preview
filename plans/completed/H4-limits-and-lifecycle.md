# H4 — Limits and lifecycle

**Status**: done  <!-- draft | approved | done -->
**Objective**: The instance stays healthy unattended: quotas, scoped keys, rate limits, expiry, garbage collection and actionable deploy warnings.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H3 done: deploy and manage API with admin keys, content server. No limits, previews never expire, orphan blobs accumulate.

---

## Target State (To-Be) — Acceptance Criteria

- [x] **H4-A1** — Quotas from config: `MAX_DEPLOY_BYTES`, `MAX_DEPLOY_FILES`, `MAX_TOTAL_BYTES`, `KEEP_DEPLOYMENTS` (default 10). Exceeding → 413/409 with codes `DEPLOY_TOO_LARGE`, `TOO_MANY_FILES`, `INSTANCE_FULL` and a `fix` hint. Checked at plan time (from the manifest) and enforced again while streaming uploads.
- [x] **H4-A2** — Key scopes `deploy`, `read`, `admin`; each route declares its scope; `POST/GET/DELETE /v1/keys` (admin) create (token shown once), list (no secrets) and revoke keys. `createdBy` on previews/deployments records the key label.
- [x] **H4-A3** — Per-key token-bucket rate limit (config `RATE_LIMIT_PER_MIN`) → 429 `RATE_LIMITED` with `Retry-After`.
- [x] **H4-A4** — TTL: `expiresAt` from `ttl` or `DEFAULT_TTL_HOURS`; `pinned` previews never expire; expired previews answer 404 on content immediately.
- [x] **H4-A5** — Reaper every 10 minutes (injectable clock): deletes expired previews, prunes deployments beyond `KEEP_DEPLOYMENTS` (never the current one), then GC removes blobs with no references. Interrupted runs are safe to repeat.
- [x] **H4-A6** — Deploy `warnings`: `ROOT_RELATIVE_URL` (in JS/CSS, path mode), `NO_ENTRY_HTML`, `LOCALHOST_URL` (references to `localhost`/`127.0.0.1`), `MIXED_CONTENT` (`http://` subresources), `LARGE_FILE` (> 5 MB). Each with `file` and `fix`.
- [x] **H4-A7** — `GET /v1/usage` (admin): totals, per-key usage, quota headroom.
- [x] **H4-A8** — Tests for every code above with a fake clock; `verify` passes.

---

## Artifacts

### 1. NEW `apps/server/src/domain/{quotas.ts,warnings.ts,reaper.ts,gc.ts}`

### 2. NEW `apps/server/src/core/infra/{rate-limit.ts,scheduler.ts}`

### 3. NEW `apps/server/src/routes/keys/index.ts`, `routes/usage/index.ts`

### 4. MODIFY `apps/server/src/core/infra/auth.ts` (scopes), deploy routes (quota checks, warnings)

### 5. NEW `packages/shared/src/{quotas.ts,warnings.ts,usage.ts}`

---

## Non-Negotiable Constraints

1. Error codes are part of the public contract: listed in `packages/shared/src/errors.ts`, never renamed after release.
2. GC never deletes a blob referenced by any deployment row.
3. Zero `any`; files ≤ 300 lines; conventional commit.

---

## Verification

```bash
bun run verify
# -> exit code 0
```

Behavior check: deploy above each limit with `curl` and read the error body; deploy with `ttl=1m`, advance the fake clock in tests, and confirm 404 + blob removal on disk.

---

## Evidence

- H4-A1 — Real server (`MAX_DEPLOY_BYTES=2000`): 2.5 KB body → 413 `DEPLOY_TOO_LARGE` with `fix`. `api.limits.test.ts`: `TOO_MANY_FILES` (zip and manifest plan, nothing persisted), inflated zip, blob stream over limit, `INSTANCE_FULL` 409 for deploy and blob PUT, identical content counted once.
- H4-A2 — Real server: read-only key → `DELETE` gives 403 `INSUFFICIENT_SCOPE` with `fix`. Tests: read/deploy/admin matrix, token shown once (never in list), revoke → 401, `KEY_NOT_FOUND`, `LAST_ADMIN_KEY`, `createdBy` = key label.
- H4-A3 — Real server (`RATE_LIMIT_PER_MIN=12`): 8 × 200 then 429 `RATE_LIMITED` with `Retry-After: 5`. Tests with fake clock: refill, per-key buckets, `0` disables.
- H4-A4 — `reaper.test.ts`: `ttl`/`DEFAULT_TTL_HOURS`/`ttl=0` expiry values; expired preview → content 404 before the reaper runs; pinned survives 30 days and reaper runs.
- H4-A5 — `reaper.test.ts` (fake clock + aged blob mtimes): expired previews removed then blobs GC'd after grace; `KEEP_DEPLOYMENTS=2` prunes but keeps the rolled-back current one; shared blobs survive; abandoned plans (stale pending + empty preview) cleaned; interrupted run completed by the next. `scheduler.test.ts`: no overlap, survives failures.
- H4-A6 — Real server: `localhost` + `http://` script → `LOCALHOST_URL` and `MIXED_CONTENT` with `file` and `fix`. `warnings.test.ts`: all five codes, no false positives on `//cdn`, https, plain links, svg xmlns; same warnings from manifest finalize.
- H4-A7 — Real server `GET /v1/usage`: totals, quota `remainingBytes`, per-key deployments/bytes; deploy-only key → 403. Test asserts no hashes/secrets in the body.
- H4-A8 — 110 tests (278 → 1532 expects); `bun run verify` exit 0 (tsc, biome, size, license, tests, build).

---

## Retro

Surprises: Bun's `Statement.run().changes` counts rows removed by `ON DELETE CASCADE`, so counts of deleted rows use `RETURNING id`. Blob mtimes are real filesystem times while the clock is faked, so tests age blob files with `utimes` (`test-support/blobs.ts`). Deviations accepted: repo/blob ports gained the methods the reaper and usage need; `DomainDeps` gained `quotas` and `contentMode`; reaper also removes abandoned `pending` plans and their empty previews (1 h grace) and blob GC keeps unreferenced blobs younger than 1 h (an upload may be waiting for its plan); `admin` implies every scope; safe methods need `read`, everything else `deploy`; `RATE_LIMIT_PER_MIN` (default 120, `0` off) and `KEEP_DEPLOYMENTS` added as env vars; `ERROR_CODES` list added to `packages/shared`.
