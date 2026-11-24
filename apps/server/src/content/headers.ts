// SPDX-License-Identifier: MIT

import type { Config } from "../core/infra/config";

const SANDBOX =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

export function securityHeaders(config: Pick<Config, "APP_ORIGIN" | "FRAME_ANCESTORS">): Headers {
  const ancestors = [config.APP_ORIGIN, ...config.FRAME_ANCESTORS].join(" ");
  return new Headers({
    "Content-Security-Policy": `${SANDBOX}; frame-ancestors ${ancestors}`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Access-Control-Allow-Origin": "*",
  });
}

export function plainResponse(
  config: Pick<Config, "APP_ORIGIN" | "FRAME_ANCESTORS">,
  status: number,
  text: string,
): Response {
  const headers = securityHeaders(config);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(text, { status, headers });
}
