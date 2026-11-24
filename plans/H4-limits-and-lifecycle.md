# H4 — Limits and lifecycle

**Status**: draft  <!-- draft | approved | done -->
**Objective**: The instance stays healthy unattended: quotas, scoped keys, rate limits, expiry, garbage collection and actionable deploy warnings.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H3 done: deploy and manage API with admin keys, content server. No limits, previews never expire, orphan blobs accumulate.

---

## Target State (To-Be) — Acceptance Criteria

- [ ] **H4-A1** — Quotas from config: `MAX_DEPLOY_BYTES`, `MAX_DEPLOY_FILES`, `MAX_TOTAL_BYTES`, `KEEP_DEPLOYMENTS` (default 10). Exceeding → 413/409 with codes `DEPLOY_TOO_LARGE`, `TOO_MANY_FILES`, `INSTANCE_FULL` and a `fix` hint. Checked at plan time (from the manifest) and enforced again while streaming uploads.
- [ ] **H4-A2** — Key scopes `deploy`, `read`, `admin`; each route declares its scope; `POST/GET/DELETE /v1/keys` (admin) create (token shown once), list (no secrets) and revoke keys. `createdBy` on previews/deployments records the key label.
- [ ] **H4-A3** — Per-key token-bucket rate limit (config `RATE_LIMIT_PER_MIN`) → 429 `RATE_LIMITED` with `Retry-After`.
- [ ] **H4-A4** — TTL: `expiresAt` from `ttl` or `DEFAULT_TTL_HOURS`; `pinned` previews never expire; expired previews answer 404 on content immediately.
- [ ] **H4-A5** — Reaper every 10 minutes (injectable clock): deletes expired previews, prunes deployments beyond `KEEP_DEPLOYMENTS` (never the current one), then GC removes blobs with no references. Interrupted runs are safe to repeat.
- [ ] **H4-A6** — Deploy `warnings`: `ROOT_RELATIVE_URL` (in JS/CSS, path mode), `NO_ENTRY_HTML`, `LOCALHOST_URL` (references to `localhost`/`127.0.0.1`), `MIXED_CONTENT` (`http://` subresources), `LARGE_FILE` (> 5 MB). Each with `file` and `fix`.
- [ ] **H4-A7** — `GET /v1/usage` (admin): totals, per-key usage, quota headroom.
- [ ] **H4-A8** — Tests for every code above with a fake clock; `verify` passes.

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

- H4-A1 —
- H4-A2 —
- H4-A3 —
- H4-A4 —
- H4-A5 —
- H4-A6 —
- H4-A7 —
- H4-A8 —

---

## Retro

