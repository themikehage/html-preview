// SPDX-License-Identifier: MIT

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { type AppEnv, authMiddleware } from "../core/infra/auth";
import { MethodNotAllowed } from "../core/infra/errors";
import type { TokenBucketLimiter } from "../core/infra/rate-limit";
import type { ServerContext } from "../core/infra/server-context";
import { createMcpServer } from "./server";

/** Stateless streamable HTTP: one short-lived server per request, authenticated like /v1. */
export function mcpRouter(ctx: ServerContext, limiter: TokenBucketLimiter): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.use("*", authMiddleware(ctx, limiter));
  router.all("/", async (c) => {
    if (c.req.method !== "POST") {
      throw new MethodNotAllowed("POST", "POST JSON-RPC messages to /mcp");
    }
    const server = createMcpServer({ ctx, key: c.get("apiKey") });
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close();
    }
  });
  return router;
}
