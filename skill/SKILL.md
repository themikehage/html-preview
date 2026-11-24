---
name: html-preview
description: Publish an HTML page or a static site to a self-hosted html-preview server and return a shareable URL. Use when the user wants to preview, share or show a generated page, prototype, report or build output ("publish this", "give me a link", "preview this page").
---

# html-preview

Deploys static HTML to a stable URL in about a second. Works through the MCP server (`/mcp`), the CLI (`npx html-preview`) or plain HTTP (`/v1`). The server publishes its own reference at `/llms.txt` and `/openapi.json`; read them when something here is not enough.

## Install (Claude Code)

```bash
claude mcp add --transport http html-preview https://<your-server>/mcp \
  --header "Authorization: Bearer $HTML_PREVIEW_KEY"
```

Copy this folder to `~/.claude/skills/html-preview/` (or `.claude/skills/` in a project) so the skill loads too. The key (`hp_…`) is printed once on first boot of the server; an admin can mint more with `POST /v1/keys`.

## When to deploy

- The user asks for a link, a preview, or to "show" a page you generated.
- You built a static site (Vite, Astro, plain HTML) and the user should look at it.
- Do **not** deploy secrets, private data or anything the user did not ask to share. Previews are reachable by anyone with the URL.

## Pick the right tool

| Situation | Use |
|---|---|
| One self-contained page | MCP `deploy_html` |
| A few small text files (html, css, js) | MCP `deploy_files` |
| A folder, images, a build output, anything large | CLI `npx html-preview deploy ./dist --name my-site` |
| MCP says `INLINE_TOO_LARGE` | run the exact command in its `fix` |

Inline MCP deploys are capped (1 MB by default). Never base64-encode binaries into a tool call.

## Naming

- Lowercase letters, digits and hyphens: `pricing-page`, `q4-report`.
- Re-use the same name to update the same URL; pick a new name for a different artifact.
- Check `list_previews` first if a name may already exist and belong to something else.

## Make it work under a path prefix

Previews live under `/<id>/…` on a separate, sandboxed origin: no cookies, no localStorage, no same-origin API calls.

- Use **relative** URLs between files: `app.css`, `img/logo.png`. Not `/app.css`.
- Vite: `base: './'`. Webpack: `publicPath: ''`. Astro: `base: './'`.
- Do not point at `localhost`; do not load `http://` resources.
- HTML attributes with root-relative URLs are rewritten for you, but URLs built in JS or CSS are not.

## Read the warnings

Every deploy returns `warnings` with the file and a `fix`. Fix them and redeploy the same name:

| Code | Meaning |
|---|---|
| `ROOT_RELATIVE_URL` | JS/CSS references `/something`; make it relative |
| `LOCALHOST_URL` | a reference to localhost will not work for viewers |
| `MIXED_CONTENT` | an `http://` subresource; use https or a relative path |
| `LARGE_FILE` | a file above 5 MB; compress it |
| `NO_ENTRY_HTML` | the entry is not an `.html` page |

## TTL etiquette

- Throwaway previews: short `ttlHours` (e.g. 24). The default is 7 days.
- Something the user wants to keep: `update_preview` with `pinned: true`.
- Don't pin by default. Expired previews are deleted.

## Errors

Errors carry a stable `code` and a `fix`; follow the `fix` instead of retrying blindly. Common ones: `INSUFFICIENT_SCOPE` (ask for a deploy key), `RATE_LIMITED` (wait `Retry-After`), `VISIBILITY_NOT_ALLOWED`, `INSTANCE_FULL` (delete old previews).

## After deploying

Give the user the `url` first, one line on what it contains, then any warnings you fixed or could not fix. Mistakes can be undone with `rollback_preview`.
