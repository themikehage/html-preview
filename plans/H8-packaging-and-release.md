# H8 — Packaging and release

**Status**: approved  <!-- draft | approved | done -->
**Objective**: Anyone can self-host html-preview with one container on Docker or Coolify, and v0.1.0 is published.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H7 done: feature-complete for v0.1. Runs only with `bun run dev`.

---

## Target State (To-Be) — Acceptance Criteria

- [x] **H8-A1** — Multi-stage `deploy/Dockerfile` on `oven/bun` slim: non-root user, `/data` volume, `HEALTHCHECK` on `/healthz`, image < 150 MB.
- [x] **H8-A2** — `deploy/docker-compose.yml` with Caddy labels/example for two hostnames on one service; `docker compose up` + bootstrap key in logs → deploy works end to end.
- [ ] **H8-A3** — Coolify template (`deploy/coolify.yml`) using `SERVICE_FQDN_*` for both origins, persistent volume and generated `ADMIN_PASSWORD`; deployed on a test Coolify server via the `coolify` skill (with approval) and smoke-checked.
- [x] **H8-A4** — Admin backup endpoint `POST /v1/admin/backup` (`VACUUM INTO` snapshot under `DATA_DIR/backups`) and documented restore.
- [x] **H8-A5** — Docs: README (es) with quickstart; `docs/self-hosting.md`, `docs/api.md` (links to OpenAPI), `docs/agents.md` (MCP config for Claude Code, Codex, Cursor; skill install); `SECURITY.md`; `CONTRIBUTING.md`.
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

- H8-A1 — image `deploy/Dockerfile` on `oven/bun:1.3.14-alpine` builds (147 MB; `-slim` was 247 MB), runs as uid 1000 `bun`, `/data` volume, HEALTHCHECK (sends the APP_ORIGIN Host) reports `healthy`.
- H8-A2 — `docker compose up -d` on :3931: bootstrap key in logs, CLI `deploy` → URL served `<h1>desde docker</h1>`, dashboard login 200; after `down`/`up` the volume kept the data and no new bootstrap key. Caddy profile + `Caddyfile.example` written, not run (no public hosts).
- H8-A3 — PENDING. `deploy/coolify.yml` written and YAML-valid; the multi-domain (`SERVICE_FQDN_*` + second domain in Domains) behavior is unverified until a test Coolify deploy, which needs approval.
- H8-A4 — `POST /v1/admin/backup` (`api.backup.test.ts`: snapshot opens read-only, `integrity_check` ok, contains the preview; non-admin 403, no key 401). Verified in the container: file under `/data/backups`. Restore documented in `docs/self-hosting.md`.
- H8-A5 — README (es), `docs/{self-hosting,api,agents}.md`, `SECURITY.md`, `CONTRIBUTING.md`; MCP/CLI names checked against `MCP_TOOL_NAMES` and `help.ts`.
- H8-A6 — PARTIAL. npm `html-preview` is taken (v1.0.0, not ours) → user picked from `live-html`/`live-pages`/`htmlive`; `htmlive` taken, `live-html` and `live-pages` free; CLI renamed `live-pages` (bins `live-pages` + `html-preview`), `npx` hints updated. GitHub repo `themikehage/html-preview` does not exist yet (not created); GHCR namespace unverified until first push.
- H8-A7 — PARTIAL. `.github/workflows/release.yml` (tag `v*`: verify, tag==versions, GHCR push, npm publish with provenance via `NPM_TOKEN`) written and YAML-valid; `npm pack --dry-run` ok (`live-pages-0.1.0.tgz`, 8.9 kB). Tag NOT pushed; needs the repo, secrets and explicit approval.
- H8-A8 — `bun run verify` green (188 tests, bundles ok). CI `docker` job added; CI has never run (no remote).

---

## Retro

- (open) Surfaced: npm name taken; `npx html-preview` in hints would have run a stranger's package; `-slim` image misses the 150 MB budget; compose interpolates `:?` vars even for inactive profiles.

