// SPDX-License-Identifier: MIT

import { DeployFilesArgs, DeployHtmlArgs, DeployResponse } from "@html-preview/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PayloadTooLarge } from "../../core/infra/errors";
import { type DeployFile, deployFiles } from "../../domain/deploy-files";
import { toDeployResponse } from "../../routes/previews/views";
import { type McpEnv, guarded, ok } from "../result";

const encoder = new TextEncoder();

class InlineTooLarge extends PayloadTooLarge {
  constructor(bytes: number, limit: number, name: string) {
    super(
      `Inline payload is ${bytes} bytes; MCP deploys are limited to ${limit}`,
      `Deploy folders with the CLI: npx live-pages deploy ./<folder> --name ${name}`,
      "INLINE_TOO_LARGE",
    );
  }
}

async function deploy(
  env: McpEnv,
  args: {
    name: string;
    files: DeployFile[];
    entry?: string | undefined;
    visibility?: "unlisted" | "private" | "public" | undefined;
    ttlHours?: number | undefined;
  },
) {
  const bytes = args.files.reduce((total, file) => total + file.content.length, 0);
  const limit = env.ctx.config.MCP_MAX_INLINE_BYTES;
  if (bytes > limit) throw new InlineTooLarge(bytes, limit, args.name);
  const result = await deployFiles(env.ctx.deps, {
    name: args.name,
    files: args.files,
    createdBy: env.key.label,
    ...(args.entry ? { entry: args.entry } : {}),
    ...(args.visibility ? { visibility: args.visibility } : {}),
    ...(args.ttlHours !== undefined ? { ttlHours: args.ttlHours } : {}),
  });
  const response = toDeployResponse(env.ctx.config, result);
  const warned = response.warnings.length
    ? ` Warnings: ${response.warnings.map((w) => `${w.code}${w.file ? ` (${w.file})` : ""}`).join(", ")}.`
    : "";
  const verb = response.created ? "Deployed" : "Updated";
  return ok(
    `${response.url} — ${verb} "${response.name}" (${response.files} files).${warned}`,
    response,
  );
}

export function registerDeployTools(server: McpServer, env: McpEnv): void {
  const write = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  server.registerTool(
    "deploy_html",
    {
      title: "Deploy an HTML page",
      description:
        "Publish one self-contained HTML page and get its URL. Re-using a name updates the preview (rollback is available).",
      inputSchema: DeployHtmlArgs.shape,
      outputSchema: DeployResponse.shape,
      annotations: write,
    },
    (args) =>
      guarded(env, "deploy", () =>
        deploy(env, {
          ...args,
          files: [{ path: "index.html", content: encoder.encode(args.html) }],
        }),
      ),
  );
  server.registerTool(
    "deploy_files",
    {
      title: "Deploy a few text files",
      description:
        "Publish a handful of small text files (HTML, CSS, JS) as a site. Use relative URLs between files. For folders, binaries or large sites use the CLI.",
      inputSchema: DeployFilesArgs.shape,
      outputSchema: DeployResponse.shape,
      annotations: write,
    },
    (args) =>
      guarded(env, "deploy", () =>
        deploy(env, {
          ...args,
          files: Object.entries(args.files).map(([path, text]) => ({
            path,
            content: encoder.encode(text),
          })),
        }),
      ),
  );
}
