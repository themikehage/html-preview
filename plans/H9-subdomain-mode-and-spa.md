# H9 — Subdomain mode and SPA fallback

**Status**: draft  <!-- draft | approved | done -->
**Objective**: Instances with wildcard DNS can give each preview a real origin (so `localStorage` and root-relative JS URLs work), and single-page apps can opt into history fallback.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- v0.1 serves only in path mode under an opaque sandbox origin; unknown paths return 404.

---

## Target State (To-Be) — Acceptance Criteria

- [ ] **H9-A1** — `CONTENT_MODE=subdomain`: `<id>.<content host>` serves the preview; `<name>.<content host>` only for `public`; `<id>--<deploymentId>.<content host>` for a fixed deployment (single DNS label).
- [ ] **H9-A2** — In subdomain mode the sandbox CSP keeps `allow-same-origin` so storage works within that preview's own origin; no root-relative rewriting; the `ROOT_RELATIVE_URL` warning is not emitted.
- [ ] **H9-A3** — `private` in subdomain mode: ticket exchanged for an `HttpOnly; Secure` cookie scoped to the preview host; share link token leaves the URL after redemption.
- [ ] **H9-A4** — Per-preview `spa: boolean` (API, MCP, CLI `--spa`, dashboard): unknown paths without an extension return the entry with 200.
- [ ] **H9-A5** — Deploy responses and `docs/self-hosting.md` explain wildcard DNS/TLS setup (Caddy on-demand TLS, Traefik DNS challenge on Coolify).
- [ ] **H9-A6** — Tests for both modes share one suite parameterized by mode; `verify` passes.

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

- H9-A1 —
- H9-A2 —
- H9-A3 —
- H9-A4 —
- H9-A5 —
- H9-A6 —

---

## Retro

