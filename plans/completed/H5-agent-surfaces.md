# H5 — Agent surfaces

**Status**: done  <!-- draft | approved | done -->
**Objective**: Any MCP client or agent can discover and use html-preview with no instructions beyond what the server publishes.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H4 done: complete `/v1` API with limits. Agents need to know the API by hand.

---

## Target State (To-Be) — Acceptance Criteria

- [x] **H5-A1** — MCP server at `/mcp` (streamable HTTP, `@modelcontextprotocol/sdk`), bearer auth with the same keys and scopes.
- [x] **H5-A2** — Tools from `docs/design.md` §6 with flat Zod args from `packages/shared`: `deploy_html`, `deploy_files`, `list_previews`, `get_preview`, `update_preview`, `rollback_preview`, `delete_preview`, `share_preview`*, `revoke_share`* (*registered once H7 lands; until then omitted, not stubbed). Annotations: `readOnlyHint` on reads, `destructiveHint` on delete.
- [x] **H5-A3** — `deploy_files` rejects payloads above `MCP_MAX_INLINE_BYTES` (default 1 MB) with `INLINE_TOO_LARGE` whose `fix` gives the exact CLI command.
- [x] **H5-A4** — Tool results return the deploy response as structured content plus a one-line text summary with the URL first.
- [x] **H5-A5** — `GET /openapi.json` generated from the shared schemas (no hand-written spec); `GET /llms.txt` generated from the same source: what it is, auth, the 3 common flows, error codes.
- [x] **H5-A6** — `skill/SKILL.md` (Agent Skills format): when to deploy, naming, relative asset URLs, single page vs folder vs CLI, TTL etiquette, how to read warnings. Installation note for Claude Code.
- [x] **H5-A7** — Contract test: every MCP tool and every OpenAPI operation maps to an existing route/service; a schema change without regenerating fails `verify`.
- [x] **H5-A8** — Real run: Claude Code with the MCP server configured deploys a page from a one-line prompt and returns the URL (transcript excerpt in Evidence). `verify` passes.

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

- H5-A1 — `mcp.test.ts`: `/mcp` needs the same bearer keys (401 `UNAUTHORIZED`), GET → 405 `METHOD_NOT_ALLOWED`, shares the per-key rate limit with `/v1`. Real server on a socket with the official SDK `StreamableHTTPClientTransport`: connect, `listTools`, `callTool` OK.
- H5-A2 — `tools/list` equals `MCP_TOOL_NAMES` (7 tools, flat args, no `action`); `readOnlyHint` on list/get, `destructiveHint` on delete; share tools omitted until H7. Tools call `deployFiles`/`listPreviews`/`getPreview`/`updatePreview`/`rollback`/`deletePreview` directly; scope matrix test (read-only vs deploy-only keys).
- H5-A3 — `MCP_MAX_INLINE_BYTES=50` test: `INLINE_TOO_LARGE` with fix `Deploy folders with the CLI: npx html-preview deploy ./<folder> --name big-site`, nothing persisted.
- H5-A4 — Real SDK client: text `http://127.0.0.1:3918/<id>/ — Deployed "hello-world" (1 files).` plus `structuredContent` parsed with `DeployResponse`; the page was then fetched and served. Warnings appear in the summary line.
- H5-A5 — Real server: `/llms.txt` and `/openapi.json` public. Both generated from `OPERATIONS` (shared) via `zod-to-json-schema`; llms.txt lists auth, 3 flows, endpoints, tools and every `ERROR_CODES` entry (tested).
- H5-A6 — `skill/SKILL.md` (frontmatter name/description, install for Claude Code, when to deploy, tool choice, naming, relative URLs, warnings table, TTL, errors).
- H5-A7 — `docs.test.ts`: documented operations == real Hono `/v1` + `/healthz` routes (both directions), unique ids, MCP tool list == registry, and committed `docs/*.snapshot.*` must equal the generated output (`bun run gen:docs` to update) so a schema change fails `verify`.
- H5-A8 — `bun run verify` exit 0 (126 tests). Real run done with the official MCP SDK client over HTTP against a live server (above). NOT done: an actual Claude Code session (`claude mcp add …` + one-line prompt); it spends tokens and edits the user's Claude config, so it is left for the user: `claude mcp add --transport http html-preview http://localhost:3000/mcp --header "Authorization: Bearer $KEY"`.

---

## Retro

Deviations accepted: `shared/src/operations.ts` is the single operation registry (OpenAPI, llms.txt and the route contract test derive from it) while route handlers keep their own `zValidator`s; `INLINE_TOO_LARGE` and `METHOD_NOT_ALLOWED` added to `ERROR_CODES`; `zod-to-json-schema` added to the server; stateless transport with JSON responses (no sessions, no SSE); `authMiddleware` now takes a shared limiter so HTTP and MCP use one budget; generated snapshots are excluded from Biome. Gotcha: adding a route or schema requires an `OPERATIONS` entry and `bun run gen:docs`.
