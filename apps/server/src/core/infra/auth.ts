// SPDX-License-Identifier: MIT

import type { ApiKey } from "@html-preview/shared";
import type { MiddlewareHandler } from "hono";
import { authenticate } from "../../domain/api-keys";
import type { ServerContext } from "./server-context";

export type AppEnv = { Variables: { apiKey: ApiKey } };

export function authMiddleware(ctx: ServerContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("apiKey", authenticate(ctx.deps, c.req.header("authorization")));
    await next();
  };
}
