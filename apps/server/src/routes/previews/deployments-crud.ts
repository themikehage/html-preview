// SPDX-License-Identifier: MIT

import { zValidator } from "@hono/zod-validator";
import {
  DeploymentParam,
  NameParam,
  PlanDeploymentRequest,
  type PlanDeploymentResponse,
} from "@html-preview/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../core/infra/auth";
import type { ServerContext } from "../../core/infra/server-context";
import { finalizeDeployment, planDeployment } from "../../domain/deploy";
import { invalid } from "../validate";
import { toDeployResponse } from "./views";

export function deploymentsCrud(ctx: ServerContext): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.post(
    "/:name/deployments",
    zValidator("param", NameParam, invalid("path parameter")),
    zValidator("json", PlanDeploymentRequest, invalid("body")),
    async (c) => {
      const { name } = c.req.valid("param");
      const body = c.req.valid("json");
      const plan = await planDeployment(ctx.deps, {
        name,
        files: body.files,
        createdBy: c.get("apiKey").label,
        ...(body.entry ? { entry: body.entry } : {}),
        ...(body.message ? { message: body.message } : {}),
        ...(body.visibility ? { visibility: body.visibility } : {}),
        ...(body.ttl !== undefined ? { ttlHours: body.ttl } : {}),
      });
      const response: PlanDeploymentResponse = {
        deploymentId: plan.deploymentId,
        missing: plan.missing,
      };
      return c.json(response, 201);
    },
  );
  router.post(
    "/:name/deployments/:id/finalize",
    zValidator("param", DeploymentParam, invalid("path parameter")),
    async (c) => {
      const { name, id } = c.req.valid("param");
      const result = await finalizeDeployment(ctx.deps, { name, deploymentId: id });
      return c.json(toDeployResponse(ctx.config, result), result.created ? 201 : 200);
    },
  );
  return router;
}
