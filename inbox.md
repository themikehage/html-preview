# Inbox — html-preview

Loose ideas, bugs and requests that are not yet planned. One line each. `/TRIAGE` reviews this file and promotes entries into plans (`plans/H<N>-<slug>.md`); remove an entry once promoted or discarded.

---

- Optional headless sidecar that returns a screenshot and console errors after each deploy, so agents can verify what they shipped.
- OIDC login for the dashboard (instead of the single admin password).
- Spaces integration: `manage_preview(action: "publish")` can use html-preview as a remote backend through a port.
- Live reload for `html-preview watch` (wrapper page with SSE; the sandbox CSP forbids injecting into the preview itself).
- Out of scope by design (`docs/design.md` §1), listed so nobody re-proposes them silently: server builds, server-side code, custom domains per preview, multi-tenancy.
