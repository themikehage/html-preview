// SPDX-License-Identifier: MIT

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpEnv } from "../result";
import { registerDeployTools } from "./deploy";
import { registerManageTools } from "./manage";

// share_preview / revoke_share are registered once share links exist (H7); never stubbed.
export function registerTools(server: McpServer, env: McpEnv): void {
  registerDeployTools(server, env);
  registerManageTools(server, env);
}
