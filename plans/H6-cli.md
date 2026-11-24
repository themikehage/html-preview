# H6 — CLI

**Status**: draft  <!-- draft | approved | done -->
**Objective**: `npx html-preview deploy ./dist` works from any machine, uploads only changed files and prints machine-readable output for agents.

**Active rules**: `backend.rules.md`.

---

## Current State (As-Is)

- H5 done: API, MCP, docs. `packages/cli` is an empty placeholder from H1.

---

## Target State (To-Be) — Acceptance Criteria

- [ ] **H6-A1** — Commands: `login` (URL + key, stored in `~/.config/html-preview/config.json` mode 0600, overridable with `HTML_PREVIEW_URL` / `HTML_PREVIEW_KEY`), `deploy <dir|file>`, `list`, `info <name>`, `open <name>`, `rollback <name> [--to]`, `rm <name>`, `share <name>` (after H7), `watch <dir>`.
- [ ] **H6-A2** — `deploy` hashes files locally, runs the manifest flow, uploads only missing blobs with bounded concurrency, finalizes; name defaults to the folder or file name (slugified). Flags `--name --ttl --visibility --entry --message --pinned`.
- [ ] **H6-A3** — Respects `.gitignore`-style `.previewignore`; never uploads dotfiles or `node_modules`.
- [ ] **H6-A4** — `--json` on every command prints exactly the API response (or error body) on stdout; human output otherwise; exit codes: 0 ok, 1 usage, 2 API error, 3 network.
- [ ] **H6-A5** — `watch` re-deploys on change with debounce; each cycle uploads only changed blobs.
- [ ] **H6-A6** — Runs on Node ≥ 20 and Bun, uses only `fetch` and built-ins (zero runtime deps besides `shared` bundled in); published bundle < 200 KB.
- [ ] **H6-A7** — Tests against an in-process server; `verify` passes.

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

- H6-A1 —
- H6-A2 —
- H6-A3 —
- H6-A4 —
- H6-A5 —
- H6-A6 —
- H6-A7 —

---

## Retro

