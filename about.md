# About — html-preview

> **Last updated**: 2026-11-25  
> **Stack**: Bun + Hono + bun:sqlite + Zod + MCP SDK (server-rendered Hono JSX dashboard)

html-preview es un servidor autohospedado y agent-first para desplegar y gestionar previews HTML estáticas: un agente sube una página o una carpeta y recibe una URL estable en menos de un segundo.

Users are AI agents (Claude Code, Codex, Spaces agents, any MCP client) and the person who runs the instance. Core entities: **Preview** (named, mutable alias), **Deployment** (immutable manifest of files), **Blob** (content-addressed file), **API key**, **Share link**. Full product design: [docs/design.md](./docs/design.md).

> **State**: H1–H7 done (H8 packaging written, release pending approval): foundation, storage, `/v1` deploy/manage API with scoped API keys, the path-mode content server, quotas, rate limit, reaper/GC, deploy warnings, MCP server, generated agent docs, the CLI, the server-rendered dashboard, `private` enforcement and share links. Docker image, compose, Coolify template, backup endpoint and release workflow exist; the first release tag is pushed only after explicit approval. H9 (subdomain mode) follows. Sections below describe the target set by `docs/design.md` and become factual as milestones land. Update them in the commit that makes them true.

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
packages/cli/      CLI published to npm as `live-pages` (`html-preview` is taken; bins `live-pages` and `html-preview`): `src/cli.ts` dispatch, `commands/*`, `client.ts` (fetch only), `scan.ts`/`ignore.ts`/`deploy.ts`
skill/SKILL.md     agent skill
deploy/            Dockerfile (alpine, non-root, /data volume), docker-compose.yml (+ Caddy `proxy` profile), coolify.yml, .env.example
docs/design.md     product design (source of truth)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Bun (server and tests), Node ≥ 20 compatible CLI |
| **Framework** | Hono + `@hono/zod-validator`, `@modelcontextprotocol/sdk` (H5), `fflate` (zip / gzip extraction; tar parsed in `domain/archive.ts`) |
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
- `DATA_DIR` must be a persistent volume in production. It holds `html-preview.sqlite` (schema versioned with `PRAGMA user_version`, migrations in `core/infra/sqlite/migrations.ts`: append, never edit) and `blobs/`.
- Deploy is two steps: `planDeployment` persists the preview and a `pending` deployment and returns missing blob hashes; `finalizeDeployment` verifies blobs and atomically promotes it. Repos and `Transactor` are synchronous (bun:sqlite); blob I/O is async and happens outside transactions.
- Manifest paths are normalized (`./`, `//` collapsed) and rejected if absolute, `..`, backslash, NUL or hidden. Domain error codes are UPPER_SNAKE (`BLOBS_MISSING`, `INVALID_PATH`…); H1 generic codes are still lowercase.
- API keys (`hp_…`, only the SHA-256 is stored) are created by `bootstrapAdminKey` on first boot (printed once to stdout). Scopes are enforced: `read` for GET/HEAD on `/v1/previews`, `deploy` for any write on previews/blobs, `admin` for `/v1/keys` and `/v1/usage`; `admin` implies all. All `/v1/*` needs `Authorization: Bearer`; keys are rate-limited per key (token bucket, `RATE_LIMIT_PER_MIN`, 429 + `Retry-After`). The last admin key cannot be revoked.
- One-shot deploy extracts archives in memory (`domain/archive.ts`): a single top folder is stripped, `__MACOSX`/`.DS_Store` skipped, links and unsafe/hidden paths rejected. `MAX_DEPLOY_BYTES`/`MAX_DEPLOY_FILES` cap bodies and extraction (`DEPLOY_TOO_LARGE`/`TOO_MANY_FILES`, 413); manifests are checked at plan time and `MAX_TOTAL_BYTES` yields 409 `INSTANCE_FULL`.
- Visibility ceiling order: `private` < `unlisted` < `public`; `MAX_VISIBILITY` is the most open allowed. `private` previews are not served at all until H7 (share links). `/<name>/` aliases serve `public` only. Expired previews (not `pinned`) 404.
- Content responses always carry the sandbox CSP (no `allow-same-origin`) plus `Access-Control-Allow-Origin: *` (needed for module scripts from the opaque origin). HTML gets root-relative `src|href|action|poster` rewritten under `/<id>` or `/<id>@<deploymentId>`; HTML is not range-served.
- Bun 1.3.14: `HTMLRewriter` on a file-backed `Response` hangs under `Bun.serve` (buffer first) and `for await` over a request `ReadableStream` throws (use `getReader()`). In-process `fetch` tests do not catch these; keep real-socket tests (`Bun.serve({ port: 0 })`).
- `GET /v1/previews/:name/files/*` serves untrusted files from the API origin as `text/plain`/`octet-stream` with `CSP: sandbox` + `nosniff`; never relax that.
- Lifecycle: `runReaper` (every 10 min via `core/infra/scheduler.ts`, started in `index.ts` only) deletes expired non-pinned previews, stale `pending` plans (>1 h) and empty previews, prunes ready deployments beyond `KEEP_DEPLOYMENTS` (never the current one), then GC removes unreferenced blobs older than 1 h (the reference check runs per blob right before deleting). Everything is idempotent. Deploy responses carry `warnings` from `domain/warnings.ts`.
- Agent surfaces: `/mcp` is stateless streamable HTTP (POST only, JSON responses, one `McpServer` per request) authenticated and rate-limited like `/v1`; tools live in `mcp/tools/` and call the same domain services. `packages/shared/src/operations.ts` is the one registry of HTTP operations: `/openapi.json`, `/llms.txt` and the route contract test derive from it. Adding or changing a route/schema means updating `OPERATIONS` and running `bun run gen:docs` (committed `docs/*.snapshot.*` are compared in tests). `skill/SKILL.md` is the agent skill.
- CLI (`packages/cli`): zero runtime deps, Node ≥ 20 + Bun, only `fetch` and `node:*`. Import from `@html-preview/shared` with `import type` only (a runtime import bundles zod and breaks the 200 KB budget; `scripts/check-bundle.ts` runs inside `build` and also rejects Bun APIs). Exit codes 0 ok / 1 usage / 2 API error / 3 network; `--json` prints the API response or error body verbatim. All I/O goes through the injectable `Runtime` so tests run against the in-process server. The client retries 429 honoring `Retry-After`. Credentials: flags > `HTML_PREVIEW_URL`/`HTML_PREVIEW_KEY` > `$XDG_CONFIG_HOME/html-preview/config.json` (0600). `share <name>` creates a link (`--expires`, `--label`), `--list` and `--revoke <id>` manage them.
- Private previews and share links (H7): a stored visibility is clamped by `MAX_VISIBILITY` (`domain/visibility.ts#effectiveVisibility`) everywhere it is enforced. A `private` preview is a plain 404 on the content origin unless the path carries `/<id>/~<token>/…`: `<token>` is a share token (`sl_…`, only its SHA-256 stored) or an owner ticket (60 s), both exchanged by a 302 for a signed capability (1 h, bound to the preview id and, for links, checked against revocation on every request). HTML root-relative URLs are rewritten under the capability prefix; private content is `Cache-Control: private, no-store`. Failed `sl_` redemptions are rate limited per client (`x-forwarded-for`/`cf-connecting-ip`). Share links exist only for private previews; leaving `private` revokes them all. Tokens are HMAC-signed with `SIGNING_SECRET` (`domain/capability.ts`).
- Dashboard (`apps/server/src/dashboard`, Hono JSX, no client build): mounted only when `ADMIN_PASSWORD` is set; stateless signed session cookie (`HttpOnly; SameSite=Strict; Path=/dashboard`, `Secure` when `APP_ORIGIN` is https; the key mixes in the password so changing it logs everyone out), CSRF token + same-origin `Origin` check on every POST, strict CSP (`default-src 'none'`, `frame-src CONTENT_ORIGIN`). Its `Referrer-Policy` is `same-origin`, NOT `no-referrer` (Chrome then sends `Origin: null` and the CSRF origin check rejects the dashboard's own forms). CSS is imported with `with { type: "text" }`: without the attribute `bun build` emits an asset and the page loses its styles in production (`scripts/check-bundle.ts` guards it). Biome formats `.css` files: edit them after a format pass. Dashboard calls domain services only.
- Packaging (H8): build the image from the repo root (`docker build -f deploy/Dockerfile .`); it ships only the bundled `index.js` on `oven/bun:*-alpine` (~147 MB; `-slim` is ~247 MB). The HEALTHCHECK must send `Host: <APP_ORIGIN host>` because requests are routed by Host. `POST /v1/admin/backup` writes a `VACUUM INTO` snapshot to `DATA_DIR/backups` (never rotated). Docs and hints say `npx live-pages` (not `npx html-preview`, which is someone else's npm package). `release.yml` runs on tag `v*`, requires tag == all package versions, pushes to GHCR and publishes the CLI with provenance (`NPM_TOKEN` secret).
- Error codes are listed in `packages/shared/src/errors.ts` (`ERROR_CODES`); add, never rename.
- Bun `Statement.run().changes` includes rows removed by `ON DELETE CASCADE`: count deletions with `RETURNING id`. Blob mtimes are real fs times, not the fake clock: tests age them with `test-support/blobs.ts`.
- Tests: `useTestContext()` from `src/test-support/context.ts` gives a temp `DATA_DIR`, fake clock and cleanup.
- Dev defaults: `APP_ORIGIN=http://localhost:3000`, `CONTENT_ORIGIN=http://127.0.0.1:3000`; if the port is taken set all three (`PORT`, both origins). Requests are routed by `Host` header; unknown host → 421.

---

## Environment Variables

| Key | Description | Default / Example |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `DATA_DIR` | SQLite database and blobs | `./data` |
| `APP_ORIGIN` | Public origin of API, MCP and dashboard | `https://previews.example.com` |
| `CONTENT_ORIGIN` | Public origin of preview content | `https://p.example.com` |
| `CONTENT_MODE` | `path` or `subdomain` (H9) | `path` |
| `ADMIN_PASSWORD` | Dashboard login at `/dashboard`; unset = dashboard disabled (API unaffected) | — |
| `SIGNING_SECRET` | HMAC key (≥ 32 chars) for tickets, capabilities and dashboard sessions; unset = generated into `DATA_DIR/signing-secret` (0600) | generated |
| `MAX_VISIBILITY` | `unlisted`, `private` or `public` ceiling | `unlisted` |
| `DEFAULT_TTL_HOURS` | Default preview lifetime, `0` = never | `168` |
| `MAX_DEPLOY_BYTES` / `MAX_DEPLOY_FILES` / `MAX_TOTAL_BYTES` | Quotas | `52428800` / `2000` / `5368709120` |
| `MCP_MAX_INLINE_BYTES` | Max inline payload for MCP deploy tools | `1048576` |
| `KEEP_DEPLOYMENTS` | Ready deployments kept per preview | `10` |
| `RATE_LIMIT_PER_MIN` | Requests per minute per API key, `0` = off | `120` |
| `FRAME_ANCESTORS` | Extra origins allowed to embed previews | — |

---

## Project Commands

### Quality gate (mandatory)
- `bun run verify` — typecheck + `biome check` + `check:size` (no file > 300 lines) + `bun test` + build (server and CLI bundle, plus `check:bundle` ≤ 200 KB). `check:license` requires `// SPDX-License-Identifier: MIT` as first line of every `.ts`; keep a blank line after it (Biome import sorting).

### CI (mandatory)
- Workflow: `.github/workflows/ci.yml` — on every push and PR: checkout → setup Bun → `bun install --frozen-lockfile` → `bun run verify`; a second job builds the Docker image (no push). `release.yml` handles tags.

### Behavior check (optional)
- `curl` against a local server (deploy, then fetch the returned URL). `/TEST` with Playwright for the dashboard from H7.

### Server
- `node packages/cli/dist/index.js <command>` — the built CLI (`bun run build` produces it); `bun run --cwd packages/cli build` rebuilds only the CLI.
- `bun run gen:docs` — regenerate `docs/openapi.snapshot.json` and `docs/llms.snapshot.txt` after changing schemas or operations.
- `bun run dev` — server with hot reload on `:3000` (both origins via `localhost` / `127.0.0.1` in dev).
