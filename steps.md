# Steps — html-preview

Progress tracker. Agents update this after each milestone completes.

Keep it lean: every entry is **one line + a link to its plan** (archived in `plans/completed/` when done). Detail belongs in the plan, not here. Loose ideas go to [inbox.md](./inbox.md).

---

## Backlog

- [ ] **H5 — Agent surfaces**: MCP, `llms.txt`, OpenAPI, `SKILL.md` → [plan](./plans/H5-agent-surfaces.md)
- [ ] **H6 — CLI**: `html-preview deploy|list|watch|rollback|rm|share --json` → [plan](./plans/H6-cli.md)
- [ ] **H7 — Dashboard and sharing**: dashboard, `private` visibility, share links → [plan](./plans/H7-dashboard-and-sharing.md)
- [ ] **H8 — Packaging and release**: Docker, compose, Coolify template, README, v0.1.0 → [plan](./plans/H8-packaging-and-release.md)
- [ ] **H9 — Subdomain mode and SPA**: `CONTENT_MODE=subdomain`, `spa` fallback → [plan](./plans/H9-subdomain-mode-and-spa.md)

---

## In Progress

*(move items here when work starts)*

---

## Completed

- [x] **H4 — Limits and lifecycle**: quotas, key scopes + `/v1/keys`, rate limit, TTL reaper, blob GC, deploy warnings, `/v1/usage` → [plan](./plans/completed/H4-limits-and-lifecycle.md)
- [x] **H3 — Deploy API and serving**: `/v1` deploy (one-shot + manifest), API keys, content server in path mode → [plan](./plans/completed/H3-deploy-api-and-serving.md)
- [x] **H2 — Storage core**: ports, SQLite schema, blob store, deploy/rollback/delete services → [plan](./plans/completed/H2-storage-core.md)
- [x] **H1 — Foundation**: workspaces, Hono server, `/healthz`, env config, Biome, `verify`, CI → [plan](./plans/completed/H1-foundation.md)
