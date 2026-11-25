// SPDX-License-Identifier: MIT

import type { Config } from "../core/infra/config";

const SANDBOX_FLAGS =
  "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

export type HeaderConfig = Pick<Config, "APP_ORIGIN" | "FRAME_ANCESTORS" | "CONTENT_MODE">;

/**
 * Path mode: opaque origin (no `allow-same-origin`), so previews share nothing with each
 * other or with the API. Subdomain mode: each preview has its own origin, so it may keep it
 * (`allow-same-origin`) and use localStorage, cookies and root-relative URLs.
 */
export function securityHeaders(config: HeaderConfig): Headers {
  const ancestors = [config.APP_ORIGIN, ...config.FRAME_ANCESTORS].join(" ");
  const sandbox =
    config.CONTENT_MODE === "subdomain"
      ? `sandbox allow-same-origin ${SANDBOX_FLAGS}`
      : `sandbox ${SANDBOX_FLAGS}`;
  return new Headers({
    "Content-Security-Policy": `${sandbox}; frame-ancestors ${ancestors}`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Access-Control-Allow-Origin": "*",
  });
}

export function plainResponse(config: HeaderConfig, status: number, text: string): Response {
  const headers = securityHeaders(config);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(text, { status, headers });
}
