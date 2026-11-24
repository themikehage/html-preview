// SPDX-License-Identifier: MIT

import { Hono } from "hono";
import { type AppEnv, requireScope } from "../../core/infra/auth";
import type { ServerContext } from "../../core/infra/server-context";
import { getUsage } from "../../domain/usage";

export function usageRouter(ctx: ServerContext): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.get("/", requireScope("admin"), (c) => c.json(getUsage(ctx.deps)));
  return router;
}
