// SPDX-License-Identifier: MIT

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Config } from "../core/infra/config";
import type { DomainDeps } from "../core/ports/deps";
import { signClaims, verifyClaims } from "../domain/capability";
import { sha256Hex } from "../domain/hash";

export const SESSION_COOKIE = "hp_session";
export const SESSION_TTL_SECONDS = 12 * 3600;
const LOGIN_FORM_TTL_SECONDS = 600;

export interface Session {
  /** Random session id; the CSRF token is derived from it. */
  sid: string;
}

/**
 * Sessions are stateless and signed. The key mixes in ADMIN_PASSWORD, so changing the
 * password invalidates every session.
 */
function sessionKey(deps: DomainDeps, password: string): string {
  return createHmac("sha256", deps.signingSecret).update(`dashboard:${password}`).digest("hex");
}

const seconds = (now: Date): number => Math.floor(now.getTime() / 1000);

export function passwordMatches(given: string, expected: string): boolean {
  const a = Buffer.from(sha256Hex(given), "hex");
  const b = Buffer.from(sha256Hex(expected), "hex");
  return timingSafeEqual(a, b);
}

export function startSession(
  c: Context,
  deps: DomainDeps,
  config: Pick<Config, "APP_ORIGIN">,
  password: string,
): void {
  const sid = randomBytes(16).toString("base64url");
  const token = signClaims(sessionKey(deps, password), {
    k: "session",
    s: sid,
    exp: seconds(deps.clock.now()) + SESSION_TTL_SECONDS,
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    // Browsers drop Secure cookies on plain http, so it follows the origin scheme.
    secure: config.APP_ORIGIN.startsWith("https:"),
    sameSite: "Strict",
    path: "/dashboard",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function endSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/dashboard" });
}

export function readSession(c: Context, deps: DomainDeps, password: string): Session | null {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const claims = verifyClaims(sessionKey(deps, password), token, "session", deps.clock.now());
  return claims?.s ? { sid: claims.s } : null;
}

export function csrfToken(deps: DomainDeps, password: string, session: Session): string {
  return createHmac("sha256", sessionKey(deps, password))
    .update(`csrf:${session.sid}`)
    .digest("base64url");
}

export function csrfMatches(given: unknown, expected: string): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pre-login CSRF: a short-lived signed token embedded in the form. */
export function loginFormToken(deps: DomainDeps): string {
  return signClaims(deps.signingSecret, {
    k: "login",
    exp: seconds(deps.clock.now()) + LOGIN_FORM_TTL_SECONDS,
  });
}

export function loginFormValid(deps: DomainDeps, token: unknown): boolean {
  return (
    typeof token === "string" &&
    verifyClaims(deps.signingSecret, token, "login", deps.clock.now()) !== null
  );
}
