// SPDX-License-Identifier: MIT

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpEnv } from "./result";
import { registerTools } from "./tools";

export function createMcpServer(env: McpEnv): McpServer {
  const server = new McpServer(
    { name: "html-preview", version: env.ctx.version },
    {
      instructions:
        "Deploy HTML pages and small sites and get a shareable URL. Prefer deploy_html for a single page; use relative asset URLs; set a short ttlHours for throwaway previews.",
    },
  );
  registerTools(server, env);
  return server;
}
