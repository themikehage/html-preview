# H9 — Subdomain mode and SPA fallback

**Status**: done  <!-- draft | approved | done -->
**Objective**: Instances with wildcard DNS can give each preview a real origin (so `localStorage` and root-relative JS URLs work), and single-page apps can opt into history fallback.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- v0.1 serves only in path mode under an opaque sandbox origin; unknown paths return 404.

---

## Target State (To-Be) — Acceptance Criteria

- [x] **H9-A1** — `CONTENT_MODE=subdomain`: `<id>.<content host>` serves the preview; `<name>.<content host>` only for `public`; `<id>--<deploymentId>.<content host>` for a fixed deployment (single DNS label).
- [x] **H9-A2** — In subdomain mode the sandbox CSP keeps `allow-same-origin` so storage works within that preview's own origin; no root-relative rewriting; the `ROOT_RELATIVE_URL` warning is not emitted.
- [x] **H9-A3** — `private` in subdomain mode: ticket exchanged for an `HttpOnly; Secure` cookie scoped to the preview host; share link token leaves the URL after redemption.
- [x] **H9-A4** — Per-preview `spa: boolean` (API, MCP, CLI `--spa`, dashboard): unknown paths without an extension return the entry with 200.
- [x] **H9-A5** — Deploy responses and `docs/self-hosting.md` explain wildcard DNS/TLS setup (Caddy on-demand TLS, Traefik DNS challenge on Coolify).
- [x] **H9-A6** — Tests for both modes share one suite parameterized by mode; `verify` passes.

---

## Artifacts

### 1. MODIFY `apps/server/src/content/{router.ts,resolve.ts,headers.ts}`, `core/infra/{config.ts,host-dispatch.ts}`

### 2. MODIFY `apps/server/src/domain/{deploy.ts,warnings.ts}`, `packages/shared/src/preview.ts` (`spa`)

### 3. MODIFY `docs/self-hosting.md`, `about.md`

---

## Non-Negotiable Constraints

1. Path mode stays the default and keeps its stricter sandbox.
2. Zero `any`; files ≤ 300 lines; conventional commit.

---

## Verification

```bash
bun run verify
# -> exit code 0
```

Behavior check: dev with `CONTENT_MODE=subdomain` and `*.localhost`; a page that writes and reads `localStorage` works; a React Router app with `spa: true` reloads on a deep link.

---

## Evidence

- H9-A1 — `content-modes.test.ts` (both modes): `<label>.<host>` serves the preview, `<name>.<host>` only when public, `<id>--<dep>` is immutable-cached. Browser run on `*.content.localhost:3921`: real URLs ``http://<label>.content.localhost:3921/``. Deviation: ids are re-encoded as 26-char lowercase base32 (`core/infra/labels.ts`, round-trip tested) because hostnames are case-insensitive and cannot hold `_`.
- H9-A2 — Tests: CSP has `allow-same-origin` only in subdomain mode, HTML not rewritten, no `ROOT_RELATIVE_URL`. Browser: a page writing `localStorage` showed `visits:1` then `visits:2` after reload.
- H9-A3 — Tests: `~<share token>` and owner ticket answer 302 to `/` with a host-only `HttpOnly` `hp_cap` cookie (no `Domain`), token gone from the URL, cookie of one private preview opens no other, revoking the link kills the cookie session. Browser: dashboard iframe of a private preview in subdomain mode renders via ticket. Deviation: `Secure` (+`SameSite=None`) only over https or `*.localhost`; plain http uses `Lax`. Found in the browser run: with `Lax` the cross-site dashboard iframe showed "Not found".
- H9-A4 — `spa` per preview (migration 4, API `?spa=` / body / PATCH, MCP, CLI `--spa`/`--no-spa`, dashboard checkbox + badge). Tests in both modes: deep extensionless path → entry 200, `.js` miss → 404, off again → 404; CLI tests. Browser: React-Router-style `/deep/route` loads and reloads with root-relative `/app.js`.
- H9-A5 — `docs/self-hosting.md` section on subdomain mode (wildcard DNS, wildcard TLS with Caddy DNS challenge / Traefik DNS challenge, cookie caveat, SPA); the `ROOT_RELATIVE_URL` warning now points at `CONTENT_MODE=subdomain`.
- H9-A6 — One `describe.each([path, subdomain])` suite plus config and label tests; `bun run verify` green (207 tests).

---

## Retro

Subdomain labels cannot reuse base64url ids (case, `_`); a cookie `SameSite=Lax` is dropped in the dashboard's cross-site iframe, so private subdomain previews need `SameSite=None; Secure` (https/localhost). Also: never `pkill -f` a broad pattern on this shared host (it restarted the-spaces once). Gotchas added to `about.md`.

