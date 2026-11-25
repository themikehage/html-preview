# Contributing

Requirements: [Bun](https://bun.sh) 1.3.14.

```bash
bun install
bun run dev        # server on :3000 (API on localhost, content on 127.0.0.1)
bun run verify     # typecheck + biome + size + license + tests + build (must pass)
```

## Rules

- Read [`about.md`](./about.md) first (architecture, constraints, gotchas) and [`AGENTS.md`](./AGENTS.md) for the work protocol: non-trivial changes start as a plan in `plans/`.
- Strict TypeScript, no `any`; files ≤ 300 lines; dependencies injected through the server context, no singletons.
- Contracts (HTTP, MCP, OpenAPI, CLI) live in `packages/shared`. After changing schemas or routes run `bun run gen:docs`.
- Every `.ts`/`.tsx` starts with `// SPDX-License-Identifier: MIT`.
- Conventional commits (`feat(scope): …`, `fix(scope): …`). CI runs `verify` and a Docker build.
- Untrusted content must never share an origin with the API or dashboard. Do not weaken the sandbox CSP.

Security issues: see [SECURITY.md](./SECURITY.md).
