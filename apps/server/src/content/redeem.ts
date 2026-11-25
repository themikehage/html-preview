// SPDX-License-Identifier: MIT

import type { Config } from "../core/infra/config";
import type { TokenBucketLimiter } from "../core/infra/rate-limit";
import type { DomainDeps } from "../core/ports/deps";
import { mintCapability, verifyClaims } from "../domain/capability";
import { redeemLink } from "../domain/links";
import { type HeaderConfig, plainResponse, securityHeaders } from "./headers";
import { CAPABILITY_COOKIE, type Resolution } from "./resolve";

type Redeem = Extract<Resolution, { kind: "redeem" }>;

export const REDEEM_FAILURES_PER_MIN = 10;

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("cf-connecting-ip") || "unknown";
}

type RedeemConfig = HeaderConfig & Pick<Config, "CONTENT_ORIGIN">;

const CAPABILITY_SECONDS = 3600;

/** Host-only cookie (no `Domain`), so a capability never leaves its own preview host. */
function capabilityCookie(config: RedeemConfig, capability: string): string {
  const { protocol, hostname } = new URL(config.CONTENT_ORIGIN);
  // Browsers treat https and `*.localhost` as secure contexts and accept `Secure` cookies there.
  const secure =
    protocol === "https:" || hostname === "localhost" || hostname.endsWith(".localhost");
  return [
    `${CAPABILITY_COOKIE}=${capability}`,
    "Path=/",
    `Max-Age=${CAPABILITY_SECONDS}`,
    "HttpOnly",
    // Embedded by the dashboard: over https the cookie must also work in a cross-site frame.
    secure ? "SameSite=None; Secure" : "SameSite=Lax",
  ].join("; ");
}

function redirect(resolution: Redeem, capability: string, config: RedeemConfig) {
  const headers = securityHeaders(config);
  headers.set("Location", resolution.location(capability));
  headers.set("Cache-Control", "no-store");
  if (resolution.viaCookie) headers.append("Set-Cookie", capabilityCookie(config, capability));
  return new Response(null, { status: 302, headers });
}

/**
 * Exchanges a share token (`sl_…`) or an owner ticket for a signed capability that lives in
 * the path, then redirects there. Failed share-token attempts are rate limited per client so
 * guessing cannot be used to hammer the database.
 */
export function redeem(
  deps: DomainDeps,
  config: RedeemConfig,
  failures: TokenBucketLimiter,
  resolution: Redeem,
  client: string,
): Response {
  const { preview, token } = resolution;
  const now = deps.clock.now();

  if (token.startsWith("sl_")) {
    const blocked = failures.check(client);
    if (!blocked.allowed) {
      const response = plainResponse(config, 429, "Too many failed attempts");
      response.headers.set("Retry-After", String(blocked.retryAfterSeconds));
      return response;
    }
    const link = redeemLink(deps, preview.id, token);
    if (!link) {
      failures.take(client);
      return plainResponse(config, 404, "Not found");
    }
    const capability = mintCapability(deps.signingSecret, now, {
      previewId: preview.id,
      linkId: link.id,
      notAfter: link.expiresAt,
    });
    return redirect(resolution, capability, config);
  }

  const ticket = verifyClaims(deps.signingSecret, token, "ticket", now);
  if (!ticket || ticket.p !== preview.id) return plainResponse(config, 404, "Not found");
  const capability = mintCapability(deps.signingSecret, now, { previewId: preview.id });
  return redirect(resolution, capability, config);
}
