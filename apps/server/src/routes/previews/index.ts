// SPDX-License-Identifier: MIT

import { Hono } from "hono";
import type { AppEnv } from "../../core/infra/auth";
import type { ServerContext } from "../../core/infra/server-context";
import { deployCrud } from "./deploy-crud";
import { deploymentsCrud } from "./deployments-crud";
import { filesCrud } from "./files-crud";
import { manageCrud } from "./manage-crud";

export function previewsRouter(ctx: ServerContext): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.route("/", manageCrud(ctx));
  router.route("/", deployCrud(ctx));
  router.route("/", deploymentsCrud(ctx));
  router.route("/", filesCrud(ctx));
  return router;
}
