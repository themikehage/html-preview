# H2 — Storage core

**Status**: draft  <!-- draft | approved | done -->
**Objective**: Persist previews, immutable deployments and content-addressed blobs behind ports, with domain services for deploy, rollback and delete — no HTTP yet.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H1 done: server, config, errors, server context, `verify`, CI. No persistence.

---

## Target State (To-Be) — Acceptance Criteria

- [ ] **H2-A1** — Ports in `core/ports/`: `PreviewRepo`, `DeploymentRepo`, `BlobStore`, `Clock`, `Ids`. Domain code imports only ports.
- [ ] **H2-A2** — SQLite adapter (`bun:sqlite`, WAL, foreign keys on) with versioned migrations run at startup; tables `previews`, `deployments`, `deployment_files`. Schema matches `docs/design.md` §4.
- [ ] **H2-A3** — Filesystem `BlobStore` at `DATA_DIR/blobs/ab/cd/<sha256>`: `has`, `put(stream, expectedHash)` writes to a temp file, verifies SHA-256 and renames atomically; mismatch → `BadRequest` `HASH_MISMATCH`.
- [ ] **H2-A4** — `planDeployment(name, files)` returns the missing hashes; `finalizeDeployment` fails with `Conflict` `BLOBS_MISSING` (listing them) until every blob exists, then atomically points the preview to the new deployment. Upsert by `name`: first deploy creates the preview with a random 22-char `id`.
- [ ] **H2-A5** — Manifest paths are normalized and rejected when absolute, containing `..`, backslashes, NUL, or a hidden segment (`.git`, `.env`…); `entry` must exist in the manifest.
- [ ] **H2-A6** — `rollback(name, deploymentId?)` moves the pointer to the previous (or given) deployment; `deletePreview(name)` removes rows (blobs left for GC in H4).
- [ ] **H2-A7** — Unit tests run against a temp `DATA_DIR` per file; covers upsert, dedup (same file twice = one blob), rollback, path rejection, hash mismatch.
- [ ] **H2-A8** — `verify` passes with exit code 0.

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

- H2-A1 —
- H2-A2 —
- H2-A3 —
- H2-A4 —
- H2-A5 —
- H2-A6 —
- H2-A7 —
- H2-A8 —

---

## Retro

