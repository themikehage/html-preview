// SPDX-License-Identifier: MIT

import { zValidator } from "@hono/zod-validator";
import { CreateKeyRequest, type CreatedKey, type KeyList, KeyParam } from "@html-preview/shared";
import { Hono } from "hono";
import { type AppEnv, requireScope } from "../../core/infra/auth";
import type { ServerContext } from "../../core/infra/server-context";
import { createApiKey, listApiKeys, revokeApiKey } from "../../domain/api-keys";
import { invalid } from "../validate";

export function keysRouter(ctx: ServerContext): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.use("*", requireScope("admin"));

  router.post("/", zValidator("json", CreateKeyRequest, invalid("body")), (c) => {
    const { label, scopes } = c.req.valid("json");
    const created = createApiKey(ctx.deps, label, scopes);
    const body: CreatedKey = { ...created.record, key: created.key };
    return c.json(body, 201);
  });

  router.get("/", (c) => {
    const body: KeyList = { keys: listApiKeys(ctx.deps) };
    return c.json(body);
  });

  router.delete("/:id", zValidator("param", KeyParam, invalid("path parameter")), (c) => {
    revokeApiKey(ctx.deps, c.req.valid("param").id);
    return c.body(null, 204);
  });

  return router;
}
