# H5 — Agent surfaces

**Status**: draft  <!-- draft | approved | done -->
**Objective**: Any MCP client or agent can discover and use html-preview with no instructions beyond what the server publishes.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H4 done: complete `/v1` API with limits. Agents need to know the API by hand.

---

## Target State (To-Be) — Acceptance Criteria

- [ ] **H5-A1** — MCP server at `/mcp` (streamable HTTP, `@modelcontextprotocol/sdk`), bearer auth with the same keys and scopes.
- [ ] **H5-A2** — Tools from `docs/design.md` §6 with flat Zod args from `packages/shared`: `deploy_html`, `deploy_files`, `list_previews`, `get_preview`, `update_preview`, `rollback_preview`, `delete_preview`, `share_preview`*, `revoke_share`* (*registered once H7 lands; until then omitted, not stubbed). Annotations: `readOnlyHint` on reads, `destructiveHint` on delete.
- [ ] **H5-A3** — `deploy_files` rejects payloads above `MCP_MAX_INLINE_BYTES` (default 1 MB) with `INLINE_TOO_LARGE` whose `fix` gives the exact CLI command.
- [ ] **H5-A4** — Tool results return the deploy response as structured content plus a one-line text summary with the URL first.
- [ ] **H5-A5** — `GET /openapi.json` generated from the shared schemas (no hand-written spec); `GET /llms.txt` generated from the same source: what it is, auth, the 3 common flows, error codes.
- [ ] **H5-A6** — `skill/SKILL.md` (Agent Skills format): when to deploy, naming, relative asset URLs, single page vs folder vs CLI, TTL etiquette, how to read warnings. Installation note for Claude Code.
- [ ] **H5-A7** — Contract test: every MCP tool and every OpenAPI operation maps to an existing route/service; a schema change without regenerating fails `verify`.
- [ ] **H5-A8** — Real run: Claude Code with the MCP server configured deploys a page from a one-line prompt and returns the URL (transcript excerpt in Evidence). `verify` passes.

---

## Artifacts

### 1. NEW `apps/server/src/mcp/{server.ts,tools/deploy.ts,tools/manage.ts,tools/index.ts}`

### 2. NEW `apps/server/src/routes/docs/{openapi.ts,llms-txt.ts}`

### 3. NEW `skill/SKILL.md`

### 4. NEW `packages/shared/src/mcp.ts`

---

## Non-Negotiable Constraints

1. MCP tools call the same domain services as `/v1`; no logic duplicated in `mcp/`.
2. No tool with an `action` enum multiplexing operations (lesson from Spaces `manage_preview`).
3. Zero `any`; files ≤ 300 lines; conventional commit.

---

## Verification

```bash
bun run verify
# -> exit code 0
```

Behavior check: `npx @modelcontextprotocol/inspector` against `/mcp`; `claude mcp add --transport http html-preview http://localhost:3000/mcp --header "Authorization: Bearer $KEY"` and a prompt "publish a hello world page".

---

## Evidence

- H5-A1 —
- H5-A2 —
- H5-A3 —
- H5-A4 —
- H5-A5 —
- H5-A6 —
- H5-A7 —
- H5-A8 —

---

## Retro

