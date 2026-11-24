# H7 — Dashboard and sharing

**Status**: draft  <!-- draft | approved | done -->
**Objective**: The instance owner can review, share, roll back and clean up previews from a browser, and `private` previews are reachable only by the owner or a share link.

**Active rules**: `backend.rules.md` · `design.rules.md`.

---

## Current State (As-Is)

- H6 done: API, MCP and CLI. `private` visibility exists in the schema but is not enforced on content; no UI.

---

## Target State (To-Be) — Acceptance Criteria

- [ ] **H7-A1** — Dashboard login with `ADMIN_PASSWORD` (constant-time compare, rate limited), `HttpOnly; Secure; SameSite=Strict` session cookie on `APP_ORIGIN` only; CSRF token on every form post. Without `ADMIN_PASSWORD` the dashboard is disabled (API keeps working).
- [ ] **H7-A2** — Pages (server-rendered Hono JSX, no client build): previews list (favicon, name, visibility, size, updated, created by, expiry; search and filter by key), preview detail (sandboxed iframe, deployments with rollback, settings, share links, delete with confirm), API keys (create shows token once, revoke), usage.
- [ ] **H7-A3** — Favicon read on demand from the current deployment (`<link rel="icon">` of the entry, then `favicon.*`), files inside the deployment or `data:image/*` only, ≤ 256 KB, never fetched remotely; generic icon fallback.
- [ ] **H7-A4** — `private` enforcement on content: owner opens through a 60-second signed ticket minted by the dashboard; path mode carries a signed, expiring capability in the path (`/<id>/~<cap>/…`). Secret from `SIGNING_SECRET` or generated into `DATA_DIR` (0600).
- [ ] **H7-A5** — Share links: `GET/POST/DELETE /v1/previews/:name/links[/:id]`; 256-bit token stored as SHA-256, expiry 1 h–30 d (default 7 d), max 20 active, revocable, access count; failed redemptions rate limited. Setting visibility below `link` revokes all links. MCP `share_preview` / `revoke_share` and CLI `share` enabled.
- [ ] **H7-A6** — `MAX_VISIBILITY` ceiling applied to stored and requested visibility.
- [ ] **H7-A7** — Dashboard follows `design.rules.md`; usable at 375 px; no console errors (`/TEST` exploratory run).
- [ ] **H7-A8** — `verify` passes.

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

- H7-A1 —
- H7-A2 —
- H7-A3 —
- H7-A4 —
- H7-A5 —
- H7-A6 —
- H7-A7 —
- H7-A8 —

---

## Retro

