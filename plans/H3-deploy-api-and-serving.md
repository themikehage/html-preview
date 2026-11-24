# H3 — Deploy API and serving

**Status**: draft  <!-- draft | approved | done -->
**Objective**: An authenticated agent can deploy a page or a folder over HTTP and open the returned URL, served safely from the content origin in path mode.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H2 done: domain services and storage over ports. No HTTP API, no auth, content router is a 404 stub.

---

## Target State (To-Be) — Acceptance Criteria

- [ ] **H3-A1** — API keys: table `api_keys` (label, SHA-256 hash, scopes, createdAt, lastUsedAt). On first boot with no keys the server creates one admin key and prints it **once** to stdout. Bearer auth middleware on `/v1/*`; missing/invalid key → 401 `UNAUTHORIZED` with a `fix` hint.
- [ ] **H3-A2** — `PUT /v1/previews/:name` one-shot deploy accepts `text/html`, `application/zip`, `application/gzip` (tar.gz) and `multipart/form-data`; query `visibility`, `ttl`, `entry`, `message`. Archives are extracted in memory/stream with the H2 path rules (zip-slip rejected).
- [ ] **H3-A3** — Manifest flow: `POST /v1/previews/:name/deployments` → `{ deploymentId, missing }`; `PUT /v1/blobs/:sha256`; `POST /v1/previews/:name/deployments/:id/finalize`. Re-deploying with one changed file reports `uploaded: 1`.
- [ ] **H3-A4** — Every deploy returns the response shape of `docs/design.md` §6 (schema in `packages/shared`), `url` first, `created` true/false.
- [ ] **H3-A5** — Read/manage: `GET /v1/previews`, `GET /v1/previews/:name`, `PATCH /v1/previews/:name` (visibility, ttl, pinned, rename), `POST …/rollback`, `DELETE …`, `GET …/files/*`. All validated with `zValidator`.
- [ ] **H3-A6** — Content server (path mode): `/<id>/…` serves the current deployment, `/<id>@<deploymentId>/…` a fixed one, `/<name>/…` only for `public`. Directory → `index.html`; unknown → plain 404 page (no listing).
- [ ] **H3-A7** — Response headers on content: `CSP: sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads` + `frame-ancestors`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, correct `Content-Type`. Root-relative `src|href|action|poster` in HTML rewritten under the prefix (`HTMLRewriter`).
- [ ] **H3-A8** — Caching: deployment URLs `immutable, max-age=31536000`; alias URLs `no-cache` + `ETag` = hash with `304` support; `Range` requests honoured.
- [ ] **H3-A9** — Integration tests drive the real `fetch` handler for each criterion; `verify` passes.

---

## Artifacts

### 1. NEW `apps/server/src/core/ports/key-repo.port.ts`, `core/infra/sqlite/key-repo.ts`, `core/infra/auth.ts`

### 2. NEW `apps/server/src/routes/previews/{index.ts,deploy-crud.ts,deployments-crud.ts,manage-crud.ts,files-crud.ts}`, `routes/blobs/index.ts`

### 3. NEW `apps/server/src/domain/archive.ts`

Zip and tar.gz extraction into a manifest + blob writes (dependency choice — e.g. `fflate` — recorded in `about.md`).

### 4. NEW `apps/server/src/content/{router.ts,resolve.ts,headers.ts,rewrite-root-relative.ts,mime.ts}`

Port of the ideas in Spaces `serve-single.ts` / `single-origin-response.ts`, rewritten over this repo's ports.

### 5. NEW `packages/shared/src/{api-keys.ts,deploy-response.ts,api.ts}`

---

## Non-Negotiable Constraints

1. Quotas, scopes beyond admin, reaper and warnings — **not touched in this milestone** (H4).
2. No `allow-same-origin` in the sandbox, ever.
3. Zero `any`; files ≤ 300 lines; conventional commit.

---

## Verification

```bash
bun run verify
# -> exit code 0
```

Behavior check: `curl -T index.html -H "Authorization: Bearer $KEY" localhost:3000/v1/previews/demo` → open `url` in a browser, inspect headers with `curl -I`; deploy a Vite `dist` zip; run the manifest flow twice with one file changed.

---

## Evidence

- H3-A1 —
- H3-A2 —
- H3-A3 —
- H3-A4 —
- H3-A5 —
- H3-A6 —
- H3-A7 —
- H3-A8 —
- H3-A9 —

---

## Retro

