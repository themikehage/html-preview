# H6 — CLI

**Status**: done  <!-- draft | approved | done -->
**Objective**: `npx html-preview deploy ./dist` works from any machine, uploads only changed files and prints machine-readable output for agents.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H5 done: API, MCP, docs. `packages/cli` is an empty placeholder from H1.

---

## Target State (To-Be) — Acceptance Criteria

- [x] **H6-A1** — Commands: `login` (URL + key, stored in `~/.config/html-preview/config.json` mode 0600, overridable with `HTML_PREVIEW_URL` / `HTML_PREVIEW_KEY`), `deploy <dir|file>`, `list`, `info <name>`, `open <name>`, `rollback <name> [--to]`, `rm <name>`, `share <name>` (after H7, not part of this milestone), `watch <dir>`.
- [x] **H6-A2** — `deploy` hashes files locally, runs the manifest flow, uploads only missing blobs with bounded concurrency, finalizes; name defaults to the folder or file name (slugified). Flags `--name --ttl --visibility --entry --message --pinned`.
- [x] **H6-A3** — Respects `.gitignore`-style `.previewignore`; never uploads dotfiles or `node_modules`.
- [x] **H6-A4** — `--json` on every command prints exactly the API response (or error body) on stdout; human output otherwise; exit codes: 0 ok, 1 usage, 2 API error, 3 network.
- [x] **H6-A5** — `watch` re-deploys on change with debounce; each cycle uploads only changed blobs.
- [x] **H6-A6** — Runs on Node ≥ 20 and Bun, uses only `fetch` and built-ins (zero runtime deps besides `shared` bundled in); published bundle < 200 KB.
- [x] **H6-A7** — Tests against an in-process server; `verify` passes.

---

## Artifacts

### 1. NEW `packages/cli/src/{index.ts,config.ts,client.ts,hash.ts,ignore.ts,commands/*.ts,output.ts}`

### 2. MODIFY `packages/cli/package.json`

`bin: { "html-preview": "dist/index.js" }`, build with `bun build --target node`.

---

## Non-Negotiable Constraints

1. Publishing to npm is part of H8, not this milestone (needs name check and approval).
2. Zero `any`; files ≤ 300 lines; conventional commit.

---

## Verification

```bash
bun run verify
# -> exit code 0
```

Behavior check: `node packages/cli/dist/index.js deploy ./fixtures/site --json` twice (second shows `uploaded: 0`), touch one file, deploy again (`uploaded: 1`).

---

## Evidence

- H6-A1 — `login` verified against a real server (`GET /v1/previews?limit=1`), config written with mode `-rw-------` under `$XDG_CONFIG_HOME/html-preview/config.json`; a rejected key is not stored; precedence flags > env > file (tests). `deploy`, `list`, `info`, `open`, `rollback`, `rm`, `watch` exercised in `cli.test.ts`/`watch.test.ts` and with the built bundle on Node 22. `share` is deferred to H7 as the criterion says ("after H7").
- H6-A2 — Real server + `node packages/cli/dist/index.js deploy ./site --json`: first `uploaded: 3`, second `uploaded: 0`, after changing one file `uploaded: 1`. Name defaults to the slugified folder/file name (`My Site_v2` → `my-site-v2`); `--ttl --visibility --entry --message --pinned` reach the server (test). `--pinned` is applied with `PATCH` after finalize.
- H6-A3 — Test deploys a tree with `.env`, `.git/`, `node_modules/` (root and nested), and a `.previewignore` (`*.md`, `/drafts/`, `*.map`): server manifest is exactly `index.html`, `keep/b.html`. Real run: `site/.env` never uploaded (3 files, not 4). Unit tests for the gitignore subset (`ignore.test.ts`).
- H6-A4 — `--json` prints one JSON document on stdout, identical to the API response (key set asserted); API errors print the server body verbatim. Real exit codes: usage → 1, `info ghost` → 2 (`PREVIEW_NOT_FOUND`), `HTML_PREVIEW_URL=http://localhost:1` → 3 (`NETWORK_ERROR`).
- H6-A5 — Real `watch ./site --json --debounce 100` on Node: initial cycle `uploaded: 0`, after editing one file `uploaded: 1`; SIGINT stops it. Tests: two quick writes collapse to one cycle, no extra cycles afterwards, an API error is reported and watching continues, cycles never overlap.
- H6-A6 — Bundle `packages/cli/dist/index.js` is 25 KB (limit 200 KB), shebang injected with `--banner`, no Bun APIs (`scripts/check-bundle.ts` runs inside `build`). Only `fetch` and `node:*` built-ins; `@html-preview/shared` is imported as types only, so no zod in the bundle. Run on Node v22.23.1 and Bun. **Not run on Node 20** (not installed here); only APIs available in 20 are used (`util.parseArgs`, recursive `fs.watch` on Linux, global `fetch`).
- H6-A7 — `packages/cli/src/*.test.ts` run the CLI against the in-process server (`buildFetchHandler`), injectable `Runtime`. `bun run verify` green: 153 tests, 1763 expects, build + bundle check.

---

## Retro

- Rate limit: a 429 would break deploys of sites with many files (one `PUT /v1/blobs` each), so the client retries up to 4 times honoring `Retry-After` (capped at 15 s). `--pinned` keeps `expiresAt` (the reaper just skips pinned previews). The CLI must not import zod at runtime (bundle size): use `import type` from shared. Gotcha recorded in `about.md`.
