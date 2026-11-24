// SPDX-License-Identifier: MIT

import type { Health } from "@html-preview/shared";
import { Hono } from "hono";
import type { ServerContext } from "../core/infra/server-context";

export function healthRouter(ctx: ServerContext): Hono {
  const router = new Hono();
  router.get("/healthz", (c) => {
    const body: Health = { status: "ok", version: ctx.version };
    return c.json(body);
  });
  return router;
}
