# Testing handoff — what a fresh session needs

Goal: exercise the features of H1–H8 against a real server, beyond `bun run verify` (188 tests, all in-process). State at handoff: public repo `themikehage/html-preview`, CI green, tag `v0.1.0` pushed (image `ghcr.io/themikehage/html-preview:0.1.0` is public; **not on npm**), no live deployment (the Coolify smoke app was deleted).

## Setup (local)

```bash
bun install && bun run build          # server bundle (dist/) + CLI (packages/cli/dist)
mkdir -p /tmp/hp && cd /tmp/hp
PORT=3920 DATA_DIR=/tmp/hp/data ADMIN_PASSWORD=test \
APP_ORIGIN=http://localhost:3920 CONTENT_ORIGIN=http://127.0.0.1:3920 \
MAX_VISIBILITY=public bun run <repo>/dist/index.js     # prints the bootstrap admin key ONCE
export HTML_PREVIEW_URL=http://localhost:3920 HTML_PREVIEW_KEY=hp_...
alias hp="node <repo>/packages/cli/dist/index.js"
```

Requests are routed by `Host`; app and content are different hosts (`localhost` vs `127.0.0.1`). Port 3000 is used by another service on this machine: use another port and set all three (`PORT`, both origins). Use a temp `DATA_DIR`, never real data. Browser checks: `agent-browser` (Playwright is not a dependency).

Docker: `sudo -n docker build -f deploy/Dockerfile -t html-preview:dev .` (the user is not in the docker group). Compose: `HTML_PREVIEW_IMAGE=html-preview:dev PORT=3931 APP_ORIGIN=http://localhost:3931 CONTENT_ORIGIN=http://127.0.0.1:3931 sudo -n -E docker compose -f deploy/docker-compose.yml up -d`; always `down -v` afterwards.

## Checklist by area

| Area | Check | Expected |
|---|---|---|
| Deploy | `hp deploy ./dir --name x`; redeploy unchanged; change one file | 2nd run `uploaded: 0`; changed file `uploaded: 1` |
| One-shot | `curl -X PUT -H "Content-Type: text/html" --data-binary @f.html $URL/v1/previews/x`; also zip, tar.gz, multipart | 201 then 200; zip-slip / hidden paths → `INVALID_PATH` |
| Content isolation | fetch preview URL; fetch same path on app host | CSP `sandbox` without `allow-same-origin`; app host 404 |
| Lifecycle | `--ttl 1`, `--pinned`, rollback, delete; quotas via tiny `MAX_DEPLOY_BYTES` | expiry 404, rollback moves pointer, 413 / `INSTANCE_FULL` |
| Keys / limits | scoped keys (`read`, `deploy`, `admin`), `RATE_LIMIT_PER_MIN=5` | 403 `INSUFFICIENT_SCOPE`, 429 + `Retry-After`; CLI retries |
| MCP | `claude mcp add --transport http html-preview $URL/mcp --header "Authorization: Bearer $KEY"`, then call `deploy_html`, `share_preview` | **Never run in a real Claude Code session yet (H5-A8)** |
| Private + share | `hp deploy --visibility private`, `hp share x`, open link, `hp share x --revoke <id>` | link works, then "Not found" everywhere incl. open sessions; non-private → `PREVIEW_NOT_PRIVATE` |
| Dashboard | `/dashboard` login, list, detail iframe, rollback, delete modal, keys (token shown once), usage; 375 px width | no console errors, no horizontal overflow; wrong CSRF/Origin rejected |
| Backup | `curl -X POST -H "Authorization: Bearer $ADMIN" $URL/v1/admin/backup` | file in `DATA_DIR/backups`, opens with `PRAGMA integrity_check` ok |
| Docker | build, compose up, healthcheck, restart | image ~147 MB, uid 1000, data survives `down`/`up`, no 2nd bootstrap key |
| CLI on Node 20 | run the built CLI under Node 20 | **not tested yet** (only Node 22 here) |

## Still untested / needs the user

1. **npm publish**: the image part of the release ran; the npm job skipped because secret `NPM_TOKEN` is missing (needs the user: create an automation token on npm, `gh secret set NPM_TOKEN`, then re-run the `npm` job of the `v0.1.0` Release run). npm may reject `live-pages` by similarity; fall back to `live-html` (rename in `packages/cli/package.json`, hints and docs).
2. **`deploy/coolify.yml`** (SERVICE_FQDN_* template with two domains) is untested; the GHCR image now exists, so it can be tried (needs user approval to deploy). The Dockerfile build-pack path was smoke-tested on Coolify Oracle and works.
3. **Caddy proxy profile** in compose (real TLS, two hosts) not run.
4. **MCP from a real client** (Claude Code, Codex, Cursor) not run.
5. **Rate limit behind a proxy**: failed share-link redemptions are limited per `X-Forwarded-For` / `CF-Connecting-IP`; without them all clients share one bucket.
6. H9 (subdomain mode, SPA fallback) is not implemented: `CONTENT_MODE=subdomain` is accepted by config but has no behavior.

## Coolify notes (Oracle instance)

- Credentials: `~/.config/secrets/integrations.env` (`ORACLE_COOLIFY_URL`, `ORACLE_COOLIFY_API_KEY`); see the `coolify` skill. Project `Default` (`aitet5hutg1byuy5hcjbhuyp`), server `localhost` (`usfaz8tzw85ctz03i4kl8okf`), environment `production`. `*.pages.therry.dev` is a wildcard that already routes to Oracle.
- Public app creation: `POST /applications/public` with `build_pack: dockerfile`, `dockerfile_location: /deploy/Dockerfile`, `ports_exposes: 3000`, `domains: "https://a,https://b"`; envs via `POST /applications/<uuid>/envs`; volume via `POST /applications/<uuid>/storages` (`type: persistent`). Restart is `POST`, not `GET`.
- The token lacks `read:sensitive`, so logs hide the bootstrap key: create a key from the dashboard instead (login form needs the `_csrf` field and an `Origin` header).
- The Oracle server is **arm64**: use multi-arch images only. Coolify service logs are unreadable with this token; to debug, deploy a tiny probe service (e.g. a `bun -e` server that returns `process.arch`). `docker_compose_raw` services: `POST /services` (base64 compose, `urls` for domains), env via `PATCH /services/<uuid>/envs`, `POST .../start|restart`.
- Deploy, restart and delete need the user's approval each time. Clean up whatever you create.
