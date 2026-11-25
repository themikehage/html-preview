// SPDX-License-Identifier: MIT

import { type Context, Hono } from "hono";
import { clientKey } from "../content/redeem";
import { AppError } from "../core/infra/errors";
import { TokenBucketLimiter } from "../core/infra/rate-limit";
import type { ServerContext } from "../core/infra/server-context";
import { sha256Hex } from "../domain/hash";
import { adminRoutes } from "./admin-routes";
import { CLIENT_SCRIPT } from "./client-script";
import type { DashEnv } from "./env";
import { Layout } from "./layout";
import { LoginPage } from "./pages/login";
import { previewRoutes } from "./preview-routes";
import {
  csrfMatches,
  csrfToken,
  endSession,
  loginFormToken,
  loginFormValid,
  passwordMatches,
  readSession,
  startSession,
} from "./session";
import STYLES from "./styles.css" with { type: "text" };

const LOGIN_ATTEMPTS_PER_MIN = 10;

function securityHeaders(contentOrigin: string): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'none'",
      "style-src 'self'",
      "script-src 'self'",
      "img-src 'self'",
      `frame-src ${contentOrigin}`,
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    // `no-referrer` makes browsers send `Origin: null` on our own form posts, which the CSRF
    // origin check would reject; `same-origin` still leaks nothing to other sites.
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
  };
}

/**
 * Server-rendered admin UI on APP_ORIGIN. Everything calls the same domain services as the
 * API. Only mounted when ADMIN_PASSWORD is set.
 */
export function dashboardRouter(ctx: ServerContext, password: string): Hono<DashEnv> {
  const { deps, config } = ctx;
  const app = new Hono<DashEnv>();
  const logins = new TokenBucketLimiter(LOGIN_ATTEMPTS_PER_MIN, deps.clock);
  const headers = securityHeaders(config.CONTENT_ORIGIN);

  app.use("*", async (c, next) => {
    await next();
    for (const [name, value] of Object.entries(headers)) {
      if (!c.res.headers.has(name)) c.res.headers.set(name, value);
    }
  });

  const asset = (body: string, type: string) => {
    const etag = `"${sha256Hex(body).slice(0, 16)}"`;
    return (c: Context<DashEnv>) =>
      c.req.header("if-none-match") === etag
        ? c.body(null, 304, { ETag: etag })
        : c.body(body, 200, { "Content-Type": type, "Cache-Control": "no-cache", ETag: etag });
  };
  app.get("/assets/dashboard.css", asset(STYLES, "text/css; charset=utf-8"));
  app.get("/assets/dashboard.js", asset(CLIENT_SCRIPT, "text/javascript; charset=utf-8"));

  app.get("/login", (c) => {
    if (readSession(c, deps, password)) return c.redirect("/dashboard", 303);
    return c.html(<LoginPage token={loginFormToken(deps)} />);
  });

  app.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const retry = logins.take(clientKey(c.req.raw));
    if (!retry.allowed) {
      c.header("Retry-After", String(retry.retryAfterSeconds));
      return c.html(
        <LoginPage token={loginFormToken(deps)} error="Too many attempts. Wait a moment." />,
        429,
      );
    }
    const given = typeof body.password === "string" ? body.password : "";
    if (!loginFormValid(deps, body._csrf) || !passwordMatches(given, password)) {
      return c.html(<LoginPage token={loginFormToken(deps)} error="Wrong password." />, 401);
    }
    startSession(c, deps, config, password);
    return c.redirect("/dashboard", 303);
  });

  const guarded = new Hono<DashEnv>();
  guarded.use("*", async (c, next) => {
    const session = readSession(c, deps, password);
    if (!session) return c.redirect("/dashboard/login", 303);
    const csrf = csrfToken(deps, password, session);
    c.set("csrf", csrf);
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      const body = await c.req.parseBody({ all: true });
      if ((origin && origin !== config.APP_ORIGIN) || !csrfMatches(body._csrf, csrf)) {
        throw new AppError(
          403,
          "INVALID_CSRF",
          "The form expired or came from another site",
          "Reload the page and try again",
        );
      }
    }
    await next();
  });
  guarded.post("/logout", (c) => {
    endSession(c);
    return c.redirect("/dashboard/login", 303);
  });
  guarded.route("/", adminRoutes(ctx));
  guarded.route("/", previewRoutes(ctx));
  app.route("/", guarded);

  app.onError((error, c) => {
    const app404 = error instanceof AppError && error.status === 404;
    const status = error instanceof AppError ? error.status : 500;
    if (!(error instanceof AppError)) console.error(error);
    const message = error instanceof AppError ? error.message : "Something went wrong";
    const fix = error instanceof AppError ? error.fix : undefined;
    return c.html(
      <Layout title={app404 ? "Not found" : "Error"} csrf={c.get("csrf")}>
        <h1>{app404 ? "Not found" : "Error"}</h1>
        <p>{message}</p>
        {fix ? <p class="muted">{fix}</p> : null}
        <p>
          <a href="/dashboard">Back to previews</a>
        </p>
      </Layout>,
      status as 400 | 403 | 404 | 409 | 500,
    );
  });
  return app;
}
