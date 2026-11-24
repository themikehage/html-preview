// SPDX-License-Identifier: MIT

import { Hono } from "hono";
import { toErrorResponse } from "../core/infra/error-handler";
import { NotFound } from "../core/infra/errors";
import type { ServerContext } from "../core/infra/server-context";
import { healthRouter } from "../routes/health";

export function createContentApp(ctx: ServerContext): Hono {
  const app = new Hono();
  app.route("/", healthRouter(ctx));
  app.notFound(() => toErrorResponse(new NotFound("Preview not found")));
  app.onError((error) => toErrorResponse(error));
  return app;
}
