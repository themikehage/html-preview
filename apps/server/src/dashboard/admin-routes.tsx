// SPDX-License-Identifier: MIT

import { CreateKeyRequest } from "@html-preview/shared";
import { type Context, Hono } from "hono";
import { AppError } from "../core/infra/errors";
import type { ServerContext } from "../core/infra/server-context";
import { createApiKey, listApiKeys, revokeApiKey } from "../domain/api-keys";
import { getUsage } from "../domain/usage";
import type { DashEnv } from "./env";
import { KeysPage } from "./pages/keys";
import { UsagePage } from "./pages/usage";

export function adminRoutes(ctx: ServerContext): Hono<DashEnv> {
  const { deps } = ctx;
  const router = new Hono<DashEnv>();
  const keysPage = (
    c: Context<DashEnv>,
    extra: { error?: string; created?: { label: string; key: string } } = {},
    status: 200 | 201 | 400 | 409 = 200,
  ) => c.html(<KeysPage csrf={c.get("csrf")} keys={listApiKeys(deps)} {...extra} />, status);

  router.get("/keys", (c) => keysPage(c));

  router.post("/keys", async (c) => {
    const body = await c.req.parseBody({ all: true });
    const scopes = [body.scopes ?? []].flat();
    const parsed = CreateKeyRequest.safeParse({ label: body.label, scopes });
    if (!parsed.success) {
      return keysPage(c, { error: "Give the key a label and at least one scope." }, 400);
    }
    const { key, record } = createApiKey(deps, parsed.data.label, parsed.data.scopes);
    return keysPage(c, { created: { label: record.label, key } }, 201);
  });

  router.post("/keys/:id/revoke", (c) => {
    try {
      revokeApiKey(deps, c.req.param("id"));
      return c.redirect("/dashboard/keys", 303);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      return keysPage(c, { error: `${error.message}. ${error.fix ?? ""}`.trim() }, 409);
    }
  });

  router.get("/usage", (c) => c.html(<UsagePage csrf={c.get("csrf")} usage={getUsage(deps)} />));
  return router;
}
