// SPDX-License-Identifier: MIT

import type { ApiKey, ErrorBody, Scope } from "@html-preview/shared";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AppError, InsufficientScope, InternalError } from "../core/infra/errors";
import type { ServerContext } from "../core/infra/server-context";
import { hasScope } from "../domain/api-keys";

export interface McpEnv {
  ctx: ServerContext;
  key: ApiKey;
}

export function ok(text: string, data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: data };
}

export function failure(error: unknown): CallToolResult {
  let app: AppError;
  if (error instanceof AppError) {
    app = error;
  } else {
    console.error(error);
    app = new InternalError();
  }
  const body: ErrorBody = {
    error: {
      code: app.code,
      message: app.message,
      ...(app.fix ? { fix: app.fix } : {}),
    },
  };
  const text = `${app.code}: ${app.message}${app.fix ? `\nFix: ${app.fix}` : ""}`;
  return { isError: true, content: [{ type: "text", text }], structuredContent: body };
}

/** Runs a tool body with the same scope rule and typed errors as the HTTP API. */
export async function guarded(
  env: McpEnv,
  scope: Scope,
  run: () => CallToolResult | Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    if (!hasScope(env.key, scope)) throw new InsufficientScope(scope);
    return await run();
  } catch (error) {
    return failure(error);
  }
}
