# H8 — Packaging and release

**Status**: draft  <!-- draft | approved | done -->
**Objective**: Anyone can self-host html-preview with one container on Docker or Coolify, and v0.1.0 is published.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H7 done: feature-complete for v0.1. Runs only with `bun run dev`.

---

## Target State (To-Be) — Acceptance Criteria

- [ ] **H8-A1** — Multi-stage `deploy/Dockerfile` on `oven/bun` slim: non-root user, `/data` volume, `HEALTHCHECK` on `/healthz`, image < 150 MB.
- [ ] **H8-A2** — `deploy/docker-compose.yml` with Caddy labels/example for two hostnames on one service; `docker compose up` + bootstrap key in logs → deploy works end to end.
- [ ] **H8-A3** — Coolify template (`deploy/coolify.yml`) using `SERVICE_FQDN_*` for both origins, persistent volume and generated `ADMIN_PASSWORD`; deployed on a test Coolify server via the `coolify` skill (with approval) and smoke-checked.
- [ ] **H8-A4** — Admin backup endpoint `POST /v1/admin/backup` (`VACUUM INTO` snapshot under `DATA_DIR/backups`) and documented restore.
- [ ] **H8-A5** — Docs: README (es) with quickstart; `docs/self-hosting.md`, `docs/api.md` (links to OpenAPI), `docs/agents.md` (MCP config for Claude Code, Codex, Cursor; skill install); `SECURITY.md`; `CONTRIBUTING.md`.
- [ ] **H8-A6** — Name availability checked (npm `html-preview`, GHCR, GitHub); alternative chosen with the user if taken.
- [ ] **H8-A7** — Release workflow on tag `v*`: builds and pushes the image to GHCR, publishes the CLI to npm with provenance. First tag `v0.1.0` pushed **only after explicit approval**.
- [ ] **H8-A8** — `verify` passes; CI also builds the Docker image.

---

## Artifacts

### 1. NEW `deploy/{Dockerfile,docker-compose.yml,Caddyfile.example,coolify.yml}`, `.dockerignore`

### 2. NEW `.github/workflows/release.yml`

### 3. NEW `apps/server/src/routes/admin/backup.ts`

### 4. NEW `docs/{self-hosting.md,api.md,agents.md}`, `SECURITY.md`, `CONTRIBUTING.md`; MODIFY `README.md`, `about.md`, `.deploy.example.md`

---

## Non-Negotiable Constraints

1. Publishing (npm, GHCR, public repo) and deploying to any server require explicit human approval each time.
2. No secrets in images, compose files or docs.
3. Zero `any`; files ≤ 300 lines; conventional commit.

---

## Verification

```bash
bun run verify
docker build -f deploy/Dockerfile -t html-preview:dev .
# -> exit code 0
```

Behavior check: `docker compose -f deploy/docker-compose.yml up`, deploy with the CLI, open the URL; Coolify smoke per `.deploy.md`.

---

## Evidence

- H8-A1 —
- H8-A2 —
- H8-A3 —
- H8-A4 —
- H8-A5 —
- H8-A6 —
- H8-A7 —
- H8-A8 —

---

## Retro

