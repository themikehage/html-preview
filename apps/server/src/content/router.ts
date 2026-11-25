// SPDX-License-Identifier: MIT

import { Hono } from "hono";
import { TokenBucketLimiter } from "../core/infra/rate-limit";
import type { ServerContext } from "../core/infra/server-context";
import { healthRouter } from "../routes/health";
import { plainResponse, securityHeaders } from "./headers";
import { parseRange } from "./range";
import { REDEEM_FAILURES_PER_MIN, clientKey, redeem } from "./redeem";
import { CAPABILITY_COOKIE, resolveContent } from "./resolve";
import { rewriteRootRelative } from "./rewrite-root-relative";

const IMMUTABLE = "public, max-age=31536000, immutable";

function matches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === "*" || tag === etag);
}

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

export function createContentApp(ctx: ServerContext): Hono {
  const { config, deps } = ctx;
  const app = new Hono();
  app.route("/", healthRouter(ctx));
  const failures = new TokenBucketLimiter(REDEEM_FAILURES_PER_MIN, deps.clock);

  app.all("*", async (c) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD") {
      return plainResponse(config, 405, "Method not allowed");
    }
    const request = c.req.raw;
    const resolution = resolveContent(
      deps,
      {
        url: new URL(request.url),
        host: (request.headers.get("host") ?? new URL(request.url).host).toLowerCase(),
        capabilityCookie: readCookie(request.headers.get("cookie"), CAPABILITY_COOKIE),
      },
      deps.clock.now(),
    );
    if (!resolution) return plainResponse(config, 404, "Not found");
    if (resolution.kind === "redeem") {
      return redeem(deps, config, failures, resolution, clientKey(c.req.raw));
    }
    if (resolution.kind === "redirect") {
      const headers = securityHeaders(config);
      headers.set("Location", resolution.location);
      return new Response(null, { status: 308, headers });
    }

    const { file, prefix, fixed, restricted } = resolution;
    const etag = `"${file.hash}"`;
    const headers = securityHeaders(config);
    headers.set("Content-Type", file.contentType || "application/octet-stream");
    headers.set("Cache-Control", restricted ? "private, no-store" : fixed ? IMMUTABLE : "no-cache");
    headers.set("ETag", etag);
    if (matches(c.req.header("if-none-match") ?? null, etag)) {
      return new Response(null, { status: 304, headers });
    }

    const blob = await deps.blobs.open(file.hash);
    if (!blob) return plainResponse(config, 500, "Content unavailable");

    if (file.contentType.startsWith("text/html")) {
      const html = await blob.arrayBuffer();
      // Subdomain previews own their origin, so root-relative URLs already work as written.
      const page = new Response(html, { headers });
      return config.CONTENT_MODE === "subdomain" ? page : rewriteRootRelative(page, prefix);
    }
    headers.set("Accept-Ranges", "bytes");
    const range = parseRange(c.req.header("range") ?? null, blob.size);
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${blob.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${blob.size}`);
      return new Response(blob.slice(range.start, range.end + 1), { status: 206, headers });
    }
    return new Response(blob, { headers });
  });
  return app;
}
