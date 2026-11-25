// SPDX-License-Identifier: MIT

import { zValidator } from "@hono/zod-validator";
import { DeployQuery, NameParam } from "@html-preview/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../../core/infra/auth";
import { toErrorResponse } from "../../core/infra/error-handler";
import { PayloadTooLarge } from "../../core/infra/errors";
import type { ServerContext } from "../../core/infra/server-context";
import { deployFiles } from "../../domain/deploy-files";
import { invalid } from "../validate";
import { readDeployFiles } from "./request-files";
import { toDeployResponse } from "./views";

export function deployCrud(ctx: ServerContext): Hono<AppEnv> {
  const { config } = ctx;
  const router = new Hono<AppEnv>();
  router.put(
    "/:name",
    bodyLimit({
      maxSize: config.MAX_DEPLOY_BYTES,
      onError: () =>
        toErrorResponse(
          new PayloadTooLarge(
            `Body exceeds ${config.MAX_DEPLOY_BYTES} bytes`,
            "Deploy fewer or smaller files, or ask the operator to raise MAX_DEPLOY_BYTES",
            "DEPLOY_TOO_LARGE",
          ),
        ),
    }),
    zValidator("param", NameParam, invalid("path parameter")),
    zValidator("query", DeployQuery, invalid("query")),
    async (c) => {
      const { name } = c.req.valid("param");
      const query = c.req.valid("query");
      const files = await readDeployFiles(c, {
        maxBytes: config.MAX_DEPLOY_BYTES,
        maxFiles: config.MAX_DEPLOY_FILES,
      });
      const result = await deployFiles(ctx.deps, {
        name,
        files,
        createdBy: c.get("apiKey").label,
        ...(query.entry ? { entry: query.entry } : {}),
        ...(query.message ? { message: query.message } : {}),
        ...(query.visibility ? { visibility: query.visibility } : {}),
        ...(query.ttl !== undefined ? { ttlHours: query.ttl } : {}),
        ...(query.spa !== undefined ? { spa: query.spa } : {}),
      });
      return c.json(toDeployResponse(config, result), result.created ? 201 : 200);
    },
  );
  return router;
}
