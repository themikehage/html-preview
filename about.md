# About — html-preview

> **Last updated**: 2026-11-24  
> **Stack**: Bun + Hono + bun:sqlite + Zod + MCP SDK (server-rendered Hono JSX dashboard)

html-preview es un servidor autohospedado y agent-first para desplegar y gestionar previews HTML estáticas: un agente sube una página o una carpeta y recibe una URL estable en menos de un segundo.

Users are AI agents (Claude Code, Codex, Spaces agents, any MCP client) and the person who runs the instance. Core entities: **Preview** (named, mutable alias), **Deployment** (immutable manifest of files), **Blob** (content-addressed file), **API key**, **Share link**. Full product design: [docs/design.md](./docs/design.md).

> **State**: greenfield. Only protocol files and plans exist; no code yet. Sections below describe the target set by `docs/design.md` and become factual as milestones land. Update them in the commit that makes them true.

---

## Architecture

Hexagonal modular monolith. Domain services work over ports; SQLite and the filesystem are adapters wired in one server context. Three delivery surfaces share the same domain services: the `/v1` HTTP API, the MCP server (`/mcp`) and the dashboard. A separate content server answers on `CONTENT_ORIGIN` and only reads.

Two hostnames point at the same process: `APP_ORIGIN` (API, MCP, dashboard, docs) and `CONTENT_ORIGIN` (untrusted HTML). The host header decides which app handles the request.

### Project Structure

```
apps/server/src/
  core/ports/      interfaces (repos, blob store, clock, ids)
  core/infra/      sqlite repos, fs blob store, server context, config, errors
  domain/          deploy, rollback, delete, quotas, warnings, reaper, gc
  routes/          /v1 api sub-routers
  content/         content origin server
  mcp/             MCP tools
  dashboard/       Hono JSX pages
packages/shared/   zod schemas (single source for API, MCP, OpenAPI, CLI)
packages/cli/      html-preview CLI (npm)
skill/SKILL.md     agent skill
deploy/            Dockerfile, compose, coolify template
docs/design.md     product design (source of truth)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Bun (server and tests), Node ≥ 20 compatible CLI |
| **Framework** | Hono + `@hono/zod-validator`, `@modelcontextprotocol/sdk` |
| **Database** | `bun:sqlite` (WAL) + content-addressed blobs under `DATA_DIR/blobs` |
| **Lint/format** | Biome |
| **Testing** | `bun test` |
| **Deploy** | Docker image, Docker Compose, Coolify |

---

## Key Constraints & Gotchas

- Untrusted HTML is served only on `CONTENT_ORIGIN`, always with `CSP: sandbox` (no `allow-same-origin` in path mode). In production the server refuses to start if both origins share a host.
- Path mode has no `localStorage`, cookies or IndexedDB inside previews, and root-relative URLs built in JS/CSS break; deploys must use relative asset URLs. Deploy responses warn about it.
- Deployments and blobs are immutable; rollback only moves a pointer. Never mutate a blob in place.
- Tests use a temporary `DATA_DIR` per test file, never the dev data directory.
- `DATA_DIR` must be a persistent volume in production.

---

## Environment Variables

| Key | Description | Default / Example |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `DATA_DIR` | SQLite database and blobs | `./data` |
| `APP_ORIGIN` | Public origin of API, MCP and dashboard | `https://previews.example.com` |
| `CONTENT_ORIGIN` | Public origin of preview content | `https://p.example.com` |
| `CONTENT_MODE` | `path` or `subdomain` (H9) | `path` |
| `ADMIN_PASSWORD` | Dashboard login (H7) | — |
| `MAX_VISIBILITY` | `unlisted`, `private` or `public` ceiling | `unlisted` |
| `DEFAULT_TTL_HOURS` | Default preview lifetime, `0` = never | `168` |
| `MAX_DEPLOY_BYTES` / `MAX_DEPLOY_FILES` / `MAX_TOTAL_BYTES` | Quotas (H4) | `52428800` / `2000` / `5368709120` |
| `FRAME_ANCESTORS` | Extra origins allowed to embed previews | — |

---

## Project Commands

### Quality gate (mandatory)
- `bun run verify` — typecheck + `biome check` + `check:size` (no file > 300 lines) + `bun test` + build. Created in H1.

### CI (mandatory)
- Workflow: `.github/workflows/ci.yml` — on every push and PR: checkout → setup Bun → `bun install --frozen-lockfile` → `bun run verify`. Created in H1.

### Behavior check (optional)
- `curl` against a local server (deploy, then fetch the returned URL). `/TEST` with Playwright for the dashboard from H7.

### Server
- `bun run dev` — server with hot reload on `:3000` (both origins via `localhost` / `127.0.0.1` in dev).
