// SPDX-License-Identifier: MIT

import { zValidator } from "@hono/zod-validator";
import { BlobParam, type BlobResponse } from "@html-preview/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../../core/infra/auth";
import { toErrorResponse } from "../../core/infra/error-handler";
import { PayloadTooLarge } from "../../core/infra/errors";
import type { ServerContext } from "../../core/infra/server-context";
import { invalid } from "../validate";

export function blobsRouter(ctx: ServerContext): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.put(
    "/:sha256",
    bodyLimit({
      maxSize: ctx.config.MAX_DEPLOY_BYTES,
      onError: () =>
        toErrorResponse(
          new PayloadTooLarge(
            `Blob exceeds ${ctx.config.MAX_DEPLOY_BYTES} bytes`,
            "Raise MAX_DEPLOY_BYTES or deploy smaller files",
          ),
        ),
    }),
    zValidator("param", BlobParam, invalid("path parameter")),
    async (c) => {
      const { sha256 } = c.req.valid("param");
      await ctx.deps.blobs.put(c.req.raw.body ?? new Uint8Array(), sha256);
      const body: BlobResponse = { hash: sha256, stored: true };
      return c.json(body);
    },
  );
  return router;
}
