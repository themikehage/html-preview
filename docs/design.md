# html-preview — product design

Status: accepted (2026-11-24). Source of truth for scope and architecture; milestones in `plans/` implement it. It reuses lessons from the Spaces preview plugin (Spaces repo: `apps/server/src/plugins/preview`, `docs/previews.md`, plans 127 and 130) but has no code dependency on it.

## 1. What it is

A small self-hosted server where an agent (or a person) uploads a static HTML page or folder and gets back a stable URL in under a second. It also lists, updates, rolls back, shares and expires those previews.

One sentence: **"`deploy` a folder, get a URL; everything else is managing that URL."**

### It is not

- A build system. The agent builds locally (`vite build --base ./`) and uploads the output. No `npm install` on the server, no sandboxes, no queues.
- A server runtime. No server-side code, functions, databases or proxies.
- A hosting platform with custom domains, analytics, comments or teams.
- Multi-tenant SaaS. One instance per person or team; API keys identify agents, not customers.

Saying no to builds removes about half of the Spaces preview plugin (`builds/`, `build-hook`, `preview-builder`, `preview-watcher`, `preview-config`) and all its failure modes.

## 2. Lessons from Spaces previews

| Spaces experience | Decision here |
|---|---|
| Untrusted agent HTML must never share an origin with the app | Same rule. Content is served from a separate content origin, always with `CSP: sandbox` |
| Single-origin mode (plan 127) avoids wildcard DNS/TLS, but breaks `localStorage`, cookies and root-relative URLs built in JS | Support both modes: `path` (default, one extra hostname) and `subdomain` (wildcard, a real origin per preview) |
| Root-relative URLs (`/assets/x.js`) break under a path prefix | Rewrite HTML attributes in path mode, and return a **warning** on deploy when JS/CSS contains root-relative URLs |
| Immutable releases + atomic swap + keep 3 | Same, but content-addressed: deployments are manifests of blob hashes, so rollback is a pointer change and old releases cost nothing extra |
| Share links: 256-bit token stored as hash, expiry, revocation, max 20 | Keep as-is |
| `publish` by name is idempotent and never overwrites by accident | `deploy` is an upsert by `name`; reusing the name creates a new deployment of the same preview |
| TTL and a reaper every 10 minutes | Same; default TTL configurable, `pinned` previews never expire |
| Favicon read on demand (plan 130) | Same, for the dashboard list |
| A 13-action single tool (`manage_preview`) is hard for models | Few, narrow MCP tools with flat arguments |

## 3. Principles

1. **Agent-first.** Every capability exists in the API before the UI. Responses are JSON with the URL first, plus `warnings` and `next` hints. Errors carry a stable `code` and a `fix` string a model can act on.
2. **One upload path, cheap re-deploys.** Client sends a manifest (`path → sha256, size`); server answers with the hashes it lacks; client uploads only those. Re-deploying a site where one file changed uploads one file.
3. **Immutable deployments, mutable aliases.** A preview (`name`) points to its current deployment. Each deployment also has its own permanent URL.
4. **Safe by default.** Content origin separate from the API/dashboard origin, sandbox CSP, unguessable URLs, no directory listing, no dotfiles, size and count quotas.
5. **Boring to operate.** One container, one volume (`/data`), SQLite, no external services. Works on Coolify, Docker Compose, or `bun run`.

## 4. Concepts

- **Preview**: `name` (slug, unique per instance), `id` (random, 22 chars), `visibility`, `expiresAt`, `pinned`, `currentDeploymentId`, `createdBy` (API key label), timestamps.
- **Deployment**: immutable manifest `{path: {hash, size, contentType}}`, `entry` (default `index.html`), `message`, `bytes`, `fileCount`, `createdAt`, `createdBy`.
- **Blob**: file content stored at `data/blobs/ab/cd/<sha256>`; garbage collected when no deployment references it.
- **Visibility**: `unlisted` (default: anyone with the URL, which contains the random id), `private` (owner session or a share link), `public` (also reachable by `name`). An instance-wide ceiling caps it, as in Spaces.
- **Share link**: token-hashed, expiring, revocable access to a `private` preview.
- **API key**: label (`claude-code@laptop`), scopes (`deploy`, `read`, `admin`), hash stored, last used.

## 5. URLs

Two hostnames, both pointing at the same container:

- `APP_ORIGIN` (`https://previews.example.com`): API (`/v1`), MCP (`/mcp`), dashboard, `llms.txt`, OpenAPI.
- `CONTENT_ORIGIN`:
  - `path` mode: `https://p.example.com/<id>/…` and `https://p.example.com/<id>@<deploymentId>/…` for a pinned deployment. Normal certificate, no wildcard.
  - `subdomain` mode: `https://<id>.p.example.com/…`. Needs wildcard DNS and TLS, gives each preview a real origin (`localStorage` works).
  - `public` previews also answer at `/<name>/` (path mode) or `<name>.p.example.com` (subdomain mode).

The server refuses to start in production if both origins resolve to the same host (same check as `origin.ts` in Spaces).

## 6. Surfaces

### HTTP API (`/v1`, bearer API key)

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/v1/previews/:name` | One-shot deploy. Body is `text/html` (single page), `application/zip`, `application/gzip` (tar.gz), or `multipart/form-data`. Query: `visibility`, `ttl`, `entry`, `message` |
| `POST` | `/v1/previews/:name/deployments` | Manifest step: `{ files: {path: {hash,size}}, entry?, message? }` → `{ deploymentId?, missing: [hash] }` |
| `PUT` | `/v1/blobs/:sha256` | Upload one missing blob (verified against the hash) |
| `POST` | `/v1/previews/:name/deployments/:id/finalize` | Promote a deployment once nothing is missing |
| `GET` | `/v1/previews` | List (`?q=`, `?createdBy=`, cursor) |
| `GET` | `/v1/previews/:name` | Detail with deployments |
| `PATCH` | `/v1/previews/:name` | `visibility`, `ttl`, `pinned`, rename |
| `POST` | `/v1/previews/:name/rollback` | To previous or given `deploymentId` |
| `DELETE` | `/v1/previews/:name` | Remove preview and its deployments |
| `GET/POST/DELETE` | `/v1/previews/:name/links[/:id]` | Share links |
| `GET` | `/v1/previews/:name/files/*` | Read a file back (lets an agent verify or patch) |

Deploy response, the same everywhere:

```json
{
  "url": "https://p.example.com/k3Jd9…/",
  "deploymentUrl": "https://p.example.com/k3Jd9…@d_7Fq…/",
  "name": "q3-report",
  "deploymentId": "d_7Fq…",
  "created": false,
  "files": 14, "bytes": 482113, "uploaded": 1,
  "expiresAt": "2026-12-01T10:00:00Z",
  "warnings": [{ "code": "ROOT_RELATIVE_URL", "file": "assets/app.js", "fix": "Build with relative asset URLs (Vite: --base ./)" }]
}
```

### MCP server (`/mcp`, streamable HTTP, same API key)

Small, flat tools. Content goes inline only for small deploys; folders go through the CLI.

- `deploy_html(name, html, visibility?, ttlHours?)`: single page, the 80% case.
- `deploy_files(name, files: {path: content}, entry?, ...)`: a handful of text files; refuses above a size limit and says to use the CLI.
- `list_previews(query?)`, `get_preview(name)`.
- `update_preview(name, visibility?, ttlHours?, pinned?)`.
- `rollback_preview(name, deploymentId?)`, `delete_preview(name)` (annotated `destructiveHint`).
- `share_preview(name, expiresInHours?, label?)`, `revoke_share(name, linkId)`.

### CLI (`npx html-preview …`, single file, no deps beyond fetch)

`deploy <dir|file> [--name] [--ttl] [--visibility]`, `list`, `open`, `rollback`, `rm`, `share`, `watch <dir>` (re-deploy on change, manifest diff keeps it cheap), `login` (stores URL + key). `--json` on every command. Name defaults to the folder or file name, as in Spaces `publish`.

### Agent docs

- `GET /llms.txt` and `GET /openapi.json`, generated from the same Zod schemas.
- A `SKILL.md` in the repo (Claude Code / Agent Skills format) with: when to deploy, how to name, relative asset URLs, single page vs folder, TTL etiquette.

### Dashboard

Server-rendered (Hono JSX), no client build. Login with an admin password set by env. Pages: previews list (favicon, name, visibility, size, updated, created by, expiry), preview detail (iframe, deployments with rollback, share links, settings), API keys. Nothing else.

## 7. Serving

- Resolve `id` → current deployment → manifest entry → blob. Manifest cached in memory (LRU) per deployment.
- `index.html` fallback for directories; optional `spa: true` per preview falls back to the entry for unknown paths.
- Headers: `CSP: sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads` in path mode (no `allow-same-origin`), plus `nosniff`, `Referrer-Policy: no-referrer`, restrictive `Permissions-Policy`, `frame-ancestors` limited to `APP_ORIGIN` and `FRAME_ANCESTORS`.
- Blobs are immutable, so deployment URLs get `Cache-Control: public, max-age=31536000, immutable` and alias URLs get `no-cache` + strong `ETag` (= hash). Byte ranges, gzip/brotli negotiation.
- Private previews: signed short-lived capability in the path (path mode) or cookie (subdomain mode), copied from Spaces `host-access.ts`.
- Paused, expired or missing previews return a small 404 page, never a listing.

## 8. Limits and lifecycle

Env-configurable defaults: 50 MB per deployment, 2,000 files, 5 GB instance total, 10 deployments kept per preview, default TTL 7 days (`0` = never), max 20 active links per preview, rate limit per key. Reaper every 10 minutes: expired previews, old deployments beyond the keep count, unreferenced blobs.

## 9. Stack

| Topic | Choice | Why |
|---|---|---|
| Runtime | Bun | Native SQLite, fast file serving, `HTMLRewriter` for path-mode rewriting, small image; same as Spaces so the serving code ports almost directly |
| HTTP | Hono + `@hono/zod-validator` | Same patterns as Spaces |
| Contracts | Zod → OpenAPI, MCP schemas and CLI types from one source | No drift between surfaces |
| MCP | `@modelcontextprotocol/sdk`, streamable HTTP | Standard remote transport |
| Storage | `bun:sqlite` + content-addressed files under `/data` | No external services |
| Image | `oven/bun` slim, non-root, healthcheck `/healthz` | One container |
| License | MIT | Matches Spaces |

Repo layout (Bun workspaces; the CLI is published to npm on its own):

```
apps/server/src/
  core/ports/      interfaces: PreviewRepo, DeploymentRepo, BlobStore, KeyRepo, LinkRepo, Clock, Ids
  core/infra/      sqlite repos, filesystem blob store, server context (DI), config, errors
  domain/          deploy, rollback, delete, quotas, warnings, reaper, gc (pure over ports)
  routes/          /v1 api (sub-routers per resource)
  content/         content origin server (path mode, later subdomain mode)
  mcp/             MCP tools over the same domain services
  dashboard/       server-rendered Hono JSX
packages/shared/   zod schemas: api payloads, errors, deploy response, mcp args
packages/cli/      `html-preview` CLI (npm)
skill/SKILL.md     agent skill
deploy/            Dockerfile, docker-compose.yml, coolify template
```

## 10. Deployment

- `docker run -v data:/data -e APP_ORIGIN=… -e CONTENT_ORIGIN=… -e ADMIN_PASSWORD=… ghcr.io/<org>/html-preview`.
- Compose file with two Traefik/Caddy hostnames on the same service.
- Coolify: compose template using `SERVICE_FQDN_*` for both hostnames, a persistent volume and a generated `ADMIN_PASSWORD`; first boot prints a bootstrap API key once (also creatable from the dashboard).
- Backups: copy `/data` (SQLite in WAL mode, `VACUUM INTO` snapshot endpoint for admins).

## 11. Milestones

| Plan | Scope |
|---|---|
| [H1](../plans/H1-foundation.md) | Workspaces, Hono server, `/healthz`, env config, Biome, `verify`, CI |
| [H2](../plans/H2-storage-core.md) | Ports, SQLite schema and migrations, content-addressed blob store, domain services (deploy, rollback, delete) |
| [H3](../plans/H3-deploy-api-and-serving.md) | `/v1` deploy API (one-shot and manifest flow), API key auth, content server in path mode with sandbox headers |
| [H4](../plans/H4-limits-and-lifecycle.md) | Quotas, key scopes, rate limit, TTL reaper, blob GC, deploy warnings |
| [H5](../plans/H5-agent-surfaces.md) | MCP server, `llms.txt`, OpenAPI, `SKILL.md` |
| [H6](../plans/H6-cli.md) | `html-preview` CLI with `deploy`, `list`, `watch`, `--json` |
| [H7](../plans/H7-dashboard-and-sharing.md) | Dashboard, `private` visibility, share links |
| [H8](../plans/H8-packaging-and-release.md) | Docker image, compose, Coolify template, README, first release |
| [H9](../plans/H9-subdomain-mode-and-spa.md) | Subdomain content mode, `spa` fallback |

Optional later work (screenshot/console check sidecar, OIDC, Spaces backend) lives in `inbox.md`.

Later and only if asked: Spaces uses html-preview as a remote backend for `manage_preview(action: "publish")` through a port, keeping its own build pipeline.

## 12. Decisions

Accepted on 2026-11-24:

1. **Repo and name.** Separate repo `html-preview`. npm, GHCR, GitHub org and domain availability still to check before the first publish (H6/H8).
2. **Default content mode.** `path`. `subdomain` arrives in H9.
3. **Default visibility.** `unlisted`, with `MAX_VISIBILITY` to force `private` instance-wide.
4. **Dashboard auth.** Single admin password (`ADMIN_PASSWORD`). OIDC stays in `inbox.md`.
5. **MCP deploys.** Both `deploy_html` and `deploy_files`, the latter capped and pointing to the CLI above the cap.
