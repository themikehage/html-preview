// SPDX-License-Identifier: MIT

import { Hono } from "hono";
import { type AppEnv, authMiddleware } from "../core/infra/auth";
import { toErrorResponse } from "../core/infra/error-handler";
import { NotFound } from "../core/infra/errors";
import type { ServerContext } from "../core/infra/server-context";
import { blobsRouter } from "./blobs";
import { healthRouter } from "./health";
import { previewsRouter } from "./previews";

export function createApp(ctx: ServerContext): Hono {
  const app = new Hono();
  const v1 = new Hono<AppEnv>();
  v1.use("*", authMiddleware(ctx));
  v1.route("/previews", previewsRouter(ctx));
  v1.route("/blobs", blobsRouter(ctx));
  app.route("/", healthRouter(ctx));
  app.route("/v1", v1);
  app.notFound(() => toErrorResponse(new NotFound("Route not found")));
  app.onError((error) => toErrorResponse(error));
  return app;
}
