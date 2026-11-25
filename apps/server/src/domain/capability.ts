// SPDX-License-Identifier: MIT

import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenKind = "ticket" | "cap" | "session" | "login";

export interface Claims {
  k: TokenKind;
  /** Expiry, unix seconds. */
  exp: number;
  /** Preview id (ticket, cap). */
  p?: string;
  /** Share link id (cap minted from a link, checked against revocation). */
  l?: string;
  /** Random session id (session). */
  s?: string;
}

export const TICKET_TTL_SECONDS = 60;
export const CAPABILITY_TTL_SECONDS = 3600;

function mac(secret: string, body: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function signClaims(secret: string, claims: Claims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${mac(secret, body).toString("base64url")}`;
}

/** Returns the claims only if the signature, kind and expiry are all valid. */
export function verifyClaims(
  secret: string,
  token: string,
  kind: TokenKind,
  now: Date,
): Claims | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const given = Buffer.from(signature, "base64url");
  const expected = mac(secret, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Claims;
    if (claims.k !== kind || typeof claims.exp !== "number") return null;
    return claims.exp * 1000 > now.getTime() ? claims : null;
  } catch {
    return null;
  }
}

const seconds = (now: Date): number => Math.floor(now.getTime() / 1000);

export function mintTicket(secret: string, previewId: string, now: Date): string {
  return signClaims(secret, { k: "ticket", p: previewId, exp: seconds(now) + TICKET_TTL_SECONDS });
}

/** `notAfter` (ISO) caps the lifetime, e.g. the expiry of the share link it came from. */
export function mintCapability(
  secret: string,
  now: Date,
  grant: { previewId: string; linkId?: string; notAfter?: string },
): string {
  const ceiling = grant.notAfter
    ? Math.floor(Date.parse(grant.notAfter) / 1000)
    : Number.POSITIVE_INFINITY;
  const exp = Math.min(seconds(now) + CAPABILITY_TTL_SECONDS, ceiling);
  return signClaims(secret, {
    k: "cap",
    p: grant.previewId,
    exp,
    ...(grant.linkId ? { l: grant.linkId } : {}),
  });
}
