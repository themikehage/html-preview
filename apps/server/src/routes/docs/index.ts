// SPDX-License-Identifier: MIT

import { Hono } from "hono";
import type { ServerContext } from "../../core/infra/server-context";
import { buildLlmsTxt } from "./llms-txt";
import { buildOpenApi } from "./openapi";

/** Public discovery documents, generated from the shared schemas. */
export function docsRouter(ctx: ServerContext): Hono {
  const router = new Hono();
  router.get("/openapi.json", (c) =>
    c.json(buildOpenApi({ version: ctx.version, serverUrl: ctx.config.APP_ORIGIN })),
  );
  router.get("/llms.txt", (c) =>
    c.text(buildLlmsTxt(ctx.config.APP_ORIGIN), 200, {
      "Content-Type": "text/plain; charset=utf-8",
    }),
  );
  return router;
}
