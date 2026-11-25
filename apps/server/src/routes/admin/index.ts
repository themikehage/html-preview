// SPDX-License-Identifier: MIT

import { Hono } from "hono";
import { type AppEnv, requireScope } from "../../core/infra/auth";
import type { ServerContext } from "../../core/infra/server-context";
import { createBackup } from "../../domain/backup";

export function adminRouter(ctx: ServerContext): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.use("*", requireScope("admin"));
  router.post("/backup", (c) => c.json(createBackup(ctx.deps), 201));
  return router;
}
