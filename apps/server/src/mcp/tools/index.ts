// SPDX-License-Identifier: MIT

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpEnv } from "../result";
import { registerDeployTools } from "./deploy";
import { registerManageTools } from "./manage";

export function registerTools(server: McpServer, env: McpEnv): void {
  registerDeployTools(server, env);
  registerManageTools(server, env);
}
