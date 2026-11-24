// SPDX-License-Identifier: MIT

import type { ApiKey, Scope } from "@html-preview/shared";
import type { MiddlewareHandler } from "hono";
import { authenticate, hasScope } from "../../domain/api-keys";
import { InsufficientScope, TooManyRequests } from "./errors";
import { TokenBucketLimiter } from "./rate-limit";
import type { ServerContext } from "./server-context";

export type AppEnv = { Variables: { apiKey: ApiKey } };

export function authMiddleware(ctx: ServerContext): MiddlewareHandler<AppEnv> {
  const limiter = new TokenBucketLimiter(ctx.config.RATE_LIMIT_PER_MIN, ctx.deps.clock);
  return async (c, next) => {
    const key = authenticate(ctx.deps, c.req.header("authorization"));
    const decision = limiter.take(key.id);
    if (!decision.allowed) {
      throw new TooManyRequests(
        decision.retryAfterSeconds,
        `Rate limit of ${ctx.config.RATE_LIMIT_PER_MIN} requests per minute exceeded for this key`,
        `Wait ${decision.retryAfterSeconds}s (Retry-After) and retry, or ask the operator to raise RATE_LIMIT_PER_MIN`,
      );
    }
    c.set("apiKey", key);
    await next();
  };
}

/** Route guard: `admin` satisfies every scope. */
export function requireScope(scope: Scope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!hasScope(c.get("apiKey"), scope)) throw new InsufficientScope(scope);
    await next();
  };
}

/** Safe methods need `read`; anything that changes state needs `deploy`. */
export const scopeByMethod: MiddlewareHandler<AppEnv> = async (c, next) => {
  const safe = c.req.method === "GET" || c.req.method === "HEAD";
  return requireScope(safe ? "read" : "deploy")(c, next);
};
