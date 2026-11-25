# H7 — Dashboard and sharing

**Status**: done  <!-- draft | approved | done -->
**Objective**: The instance owner can review, share, roll back and clean up previews from a browser, and `private` previews are reachable only by the owner or a share link.

**Active rules**: `backend.rules.md` · `design.rules.md`.

---

## Current State (As-Is)

- H6 done: API, MCP and CLI. `private` visibility exists in the schema but is not enforced on content; no UI.

---

## Target State (To-Be) — Acceptance Criteria

- [x] **H7-A1** — Dashboard login with `ADMIN_PASSWORD` (constant-time compare, rate limited), `HttpOnly; Secure; SameSite=Strict` session cookie on `APP_ORIGIN` only; CSRF token on every form post. Without `ADMIN_PASSWORD` the dashboard is disabled (API keeps working).
- [x] **H7-A2** — Pages (server-rendered Hono JSX, no client build): previews list (favicon, name, visibility, size, updated, created by, expiry; search and filter by key), preview detail (sandboxed iframe, deployments with rollback, settings, share links, delete with confirm), API keys (create shows token once, revoke), usage.
- [x] **H7-A3** — Favicon read on demand from the current deployment (`<link rel="icon">` of the entry, then `favicon.*`), files inside the deployment or `data:image/*` only, ≤ 256 KB, never fetched remotely; generic icon fallback.
- [x] **H7-A4** — `private` enforcement on content: owner opens through a 60-second signed ticket minted by the dashboard; path mode carries a signed, expiring capability in the path (`/<id>/~<cap>/…`). Secret from `SIGNING_SECRET` or generated into `DATA_DIR` (0600).
- [x] **H7-A5** — Share links: `GET/POST/DELETE /v1/previews/:name/links[/:id]`; 256-bit token stored as SHA-256, expiry 1 h–30 d (default 7 d), max 20 active, revocable, access count; failed redemptions rate limited. Setting visibility below `link` revokes all links. MCP `share_preview` / `revoke_share` and CLI `share` enabled.
- [x] **H7-A6** — `MAX_VISIBILITY` ceiling applied to stored and requested visibility.
- [x] **H7-A7** — Dashboard follows `design.rules.md`; usable at 375 px; no console errors (`/TEST` exploratory run).
- [x] **H7-A8** — `verify` passes.

---

## Artifacts

### 1. NEW `apps/server/src/dashboard/{app.tsx,session.ts,csrf.ts,layout.tsx,pages/*.tsx,components/*.tsx,styles.css}`

### 2. NEW `apps/server/src/domain/{links.ts,capability.ts,favicon.ts}`, `core/ports/link-repo.port.ts`, `core/infra/sqlite/link-repo.ts`

### 3. MODIFY `apps/server/src/content/resolve.ts` (private + capability), `mcp/tools/manage.ts`, `packages/cli/src/commands/share.ts`

### 4. NEW `packages/shared/src/links.ts`

---

## Non-Negotiable Constraints

1. The dashboard calls domain services through the server context; it never reads SQLite directly.
2. No client framework or bundler — **not introduced in this milestone**.
3. Zero `any`; files ≤ 300 lines; conventional commit.

---

## Verification

```bash
bun run verify
# -> exit code 0
```

Behavior check: `/TEST` exploratory run on the dashboard (login, deploy via CLI, see it listed, share, open link in a private window, revoke, link stops working).

---

## Evidence

- H7-A1 — `dashboard.access.test.ts` (10 tests) and a real browser run (`agent-browser`, built bundle on :3920): without `ADMIN_PASSWORD` `/dashboard` is 404 while `/v1` works; anonymous → 303 to `/dashboard/login`; wrong password → 401 "Wrong password."; right one → cookie `HttpOnly; SameSite=Strict; Path=/dashboard` (`Secure` when `APP_ORIGIN` is https, tested); constant-time compare via SHA-256 digests + `timingSafeEqual`; login limited to 10 attempts/min per client (429); login form carries a signed 10-minute token; every other POST needs the CSRF token and a same-origin `Origin` (403 otherwise); changing `ADMIN_PASSWORD` invalidates sessions.
- H7-A2 — Pages: previews list (favicon, name, visibility, size, updated, created by, expiry; search by name, filter by key, pagination, empty/no-match states), detail (sandboxed iframe, deployments + rollback + "View", settings, share links, delete modal), API keys (token shown once, revoke, last-admin guard rendered as a banner), usage (metric strips + per-key table). Covered by `dashboard.pages.test.ts` (11 tests) and screenshots at 1280 px and 375 px in the browser run.
- H7-A3 — `domain/favicon.ts`: `<link rel=icon|shortcut icon>` of the entry → file inside the deployment or `data:image/*`, then `favicon.{ico,png,svg,gif,jpg,jpeg,webp}`; ≤ 256 KB, never remote, `..` escapes rejected (test: remote, huge and escaping icons yield no favicon, generic icon shown). The favicon endpoint answers with `CSP: sandbox; default-src 'none'` so an SVG can never run script on the app origin. Browser: the green circle icon of the demo site shows in the list.
- H7-A4 — `private-sharing.test.ts`: private preview is 404 by id, by name, with junk, tampered, wrong-kind and foreign-secret tokens; owner ticket (60 s, bound to the preview) → 302 → capability (1 h) serves page and assets, HTML root-relative URLs rewritten under `/<id>/~<cap>/`, `CSP: sandbox` without `allow-same-origin`, `Cache-Control: private, no-store`. `SIGNING_SECRET` env wins, otherwise `DATA_DIR/signing-secret` is generated with mode 0600 and reused (tested). Browser: dashboard iframe of the private demo loads through a ticket; "Open in new tab" mints a fresh ticket.
- H7-A5 — `GET/POST/DELETE /v1/previews/:name/links[/:id]` (in `OPERATIONS`, OpenAPI and llms.txt regenerated); 256-bit token (`sl_…`), SHA-256 stored; expiry 1 h–30 d (default 7 d; 0 and 721 → 400); 21st active link → `TOO_MANY_LINKS`; access count per redemption; revoke kills the link and every capability minted from it at once; links expire (capability never outlives its link); leaving `private` revokes all links and going back does not resurrect them; failed `sl_` redemptions → 429 after 10 per client per minute. MCP `share_preview`/`revoke_share` (mcp.test.ts) and CLI `share [--expires --label | --list | --revoke]` (cli.test.ts, plus a run against the real server). Browser: a clean session opened the share link, saw the page; revoking in the dashboard made both the open tab (reload) and the original link return "Not found".
- H7-A6 — `effectiveVisibility(stored, MAX_VISIBILITY)` used by content serving and share-link creation; requested values were already rejected with `VISIBILITY_NOT_ALLOWED`. Tests: a preview stored as `public` under an `unlisted` ceiling is not served by name; with `MAX_VISIBILITY=private` every preview is enforced as private and shareable. The dashboard marks clamped previews ("limited by MAX_VISIBILITY") and only offers allowed visibilities.
- H7-A7 — `/TEST` exploratory run with `agent-browser` (Playwright is not a dev dependency; adding it is its own plan) against the production bundle: login (bad/good), list, detail with private iframe, delete modal as bottom sheet at 375 px with backdrop blur, Escape closes it, no horizontal scroll at 375 px, key creation, share link open/revoke, empty and no-match states. `agent-browser console/errors` reported nothing. Findings fixed during the run: (1) CSS imported without `with { type: "text" }` was not served by the bundle (unstyled pages) → fixed and guarded in `scripts/check-bundle.ts`; (2) `Referrer-Policy: no-referrer` made Chrome send `Origin: null` and the CSRF origin check rejected the dashboard's own forms → `same-origin`; (3) dialog sizing/top bar wrapping on mobile; (4) CSS assets got an ETag.
- H7-A8 — `bun run verify` green: 186 tests (+ server and CLI bundles, `check:bundle`).

---

## Deviations and decisions

- "Setting visibility below `link` revokes all links": this model has no `link` level (`private < unlisted < public`). Share links work only on `private` previews, so leaving `private` revokes them. Creating a link on a non-private preview fails with `PREVIEW_NOT_PRIVATE`.
- Dashboard lives under `/dashboard` (not at `/`); `/` redirects there only when `ADMIN_PASSWORD` is set.
- The session cookie is `Secure` only when `APP_ORIGIN` is https (browsers drop Secure cookies on plain http, which would break local dev).
- Share links are redeemed by a 302 to a signed capability so access is counted per redemption, not per asset.
- Not done (out of plan): the reaper does not prune old revoked/expired links; they only disappear with their preview.

---

## Retro

- Browser run found three bugs the unit tests could not (bundled CSS asset, `Origin: null` under `no-referrer`, mobile dialog sizing): UI milestones need the real bundle in a real browser. Gotchas recorded in `about.md`. Also: `biome check --write` reformats `.css`, so scripted edits must follow the formatted layout.
