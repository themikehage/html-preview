# H2 — Storage core

**Status**: done  <!-- draft | approved | done -->
**Objective**: Persist previews, immutable deployments and content-addressed blobs behind ports, with domain services for deploy, rollback and delete — no HTTP yet.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H1 done: server, config, errors, server context, `verify`, CI. No persistence.

---

## Target State (To-Be) — Acceptance Criteria

- [x] **H2-A1** — Ports in `core/ports/`: `PreviewRepo`, `DeploymentRepo`, `BlobStore`, `Clock`, `Ids`. Domain code imports only ports.
- [x] **H2-A2** — SQLite adapter (`bun:sqlite`, WAL, foreign keys on) with versioned migrations run at startup; tables `previews`, `deployments`, `deployment_files`. Schema matches `docs/design.md` §4.
- [x] **H2-A3** — Filesystem `BlobStore` at `DATA_DIR/blobs/ab/cd/<sha256>`: `has`, `put(stream, expectedHash)` writes to a temp file, verifies SHA-256 and renames atomically; mismatch → `BadRequest` `HASH_MISMATCH`.
- [x] **H2-A4** — `planDeployment(name, files)` returns the missing hashes; `finalizeDeployment` fails with `Conflict` `BLOBS_MISSING` (listing them) until every blob exists, then atomically points the preview to the new deployment. Upsert by `name`: first deploy creates the preview with a random 22-char `id`.
- [x] **H2-A5** — Manifest paths are normalized and rejected when absolute, containing `..`, backslashes, NUL, or a hidden segment (`.git`, `.env`…); `entry` must exist in the manifest.
- [x] **H2-A6** — `rollback(name, deploymentId?)` moves the pointer to the previous (or given) deployment; `deletePreview(name)` removes rows (blobs left for GC in H4).
- [x] **H2-A7** — Unit tests run against a temp `DATA_DIR` per file; covers upsert, dedup (same file twice = one blob), rollback, path rejection, hash mismatch.
- [x] **H2-A8** — `verify` passes with exit code 0.

---

## Artifacts

### 1. NEW `apps/server/src/core/ports/*.port.ts`

### 2. NEW `apps/server/src/core/infra/sqlite/{db.ts,migrations.ts,preview-repo.ts,deployment-repo.ts}`

### 3. NEW `apps/server/src/core/infra/fs-blob-store.ts`

### 4. NEW `apps/server/src/domain/{deploy.ts,rollback.ts,delete.ts,manifest-path.ts}`

### 5. NEW `packages/shared/src/{preview.ts,deployment.ts,manifest.ts}`

Zod: `PreviewName` (slug `^[a-z0-9][a-z0-9-]{0,62}$`), `Sha256`, `Manifest`, `Preview`, `Deployment`.

### 6. MODIFY `apps/server/src/core/infra/server-context.ts`

Wire repos, blob store, clock, ids.

---

## Non-Negotiable Constraints

1. No routes, auth or serving — **not touched in this milestone**.
2. Blobs are never mutated after rename.
3. Zero `any`; files ≤ 300 lines; conventional commit.

---

## Verification

```bash
bun run verify
# -> exit code 0
```

Behavior check: tests listed in H2-A7; `sqlite3 data/html-preview.sqlite .schema` after a dev boot shows the three tables.

---

## Evidence

- H2-A1 — Ports in `core/ports/*.port.ts` (+ `deps.ts`, `Transactor`). `domain/*` imports only ports, `@html-preview/shared` and the typed errors from `core/infra/errors`.
- H2-A2 — Dev boot with temp `DATA_DIR` → `html-preview.sqlite` with tables `previews, deployments, deployment_files`, `user_version=1`, WAL. `db.test.ts` checks WAL, foreign keys and idempotent reopen.
- H2-A3 — `fs-blob-store.test.ts`: path `blobs/ab/cd/<sha>`, stream + bytes input, mismatch → `HASH_MISMATCH` (400) with no blob or temp left, non-hex hash refused.
- H2-A4 — `deploy.test.ts`: plan returns missing hashes, finalize → `BLOBS_MISSING` (409) until uploaded, then pointer moves; first deploy creates a 22-char id, later deploys reuse it.
- H2-A5 — `manifest-path.test.ts`: absolute, `..`, backslash, NUL, `.git`/`.env`, empty paths rejected (`INVALID_PATH`); `./a//b` normalized; missing entry → `ENTRY_MISSING`.
- H2-A6 — `rollback.test.ts`: previous / explicit / forward moves, no-previous, already-current and pending cases; delete removes rows (cascade) and leaves blobs.
- H2-A7 — Every test file uses `useTestContext` (temp `DATA_DIR`, removed afterEach). Covers upsert, dedup, rollback, path rejection, hash mismatch.
- H2-A8 — `bun run verify` exit 0: 42 tests, tsc, biome, size, license, build.

---

## Retro `planDeployment` persists the preview (no current deployment) and a `pending` deployment, so an abandoned plan leaves an invisible preview row for the H4 reaper. Domain error codes are UPPER_SNAKE (plan) while H1 defaults are lowercase; unify before H3 exposes them.
