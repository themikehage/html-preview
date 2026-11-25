# Security

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private vulnerability reporting (Security → Report a vulnerability) on this repository. You will get an acknowledgement within a few days.

## Model

- Previews are untrusted HTML. They are served only from `CONTENT_ORIGIN`, a different host from the API and dashboard, always with `Content-Security-Policy: sandbox` (no `allow-same-origin` in path mode). The server refuses to start in production if both origins share a host.
- API keys are stored as SHA-256 hashes and shown once. Scopes: `read`, `deploy`, `admin`.
- Private previews and share links use random 256-bit tokens (stored hashed) and signed, expiring capabilities; revoking a link takes effect immediately.
- The dashboard is off unless `ADMIN_PASSWORD` is set; sessions are signed `HttpOnly`/`SameSite=Strict` cookies, with CSRF protection and a strict CSP.
- Out of scope by design: running server-side code, building projects, custom domains, multi-tenancy.

## Operating it safely

- Terminate TLS in front of the container and pass the `Host` header unchanged.
- Keep `MAX_VISIBILITY` at `unlisted` unless you need `public`.
- Give agents `deploy` + `read` keys, never `admin`.
- Back up `/data` (see `docs/self-hosting.md`) and protect `SIGNING_SECRET`.
