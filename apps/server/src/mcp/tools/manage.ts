// SPDX-License-Identifier: MIT

import {
  DeletePreviewArgs,
  GetPreviewArgs,
  ListPreviewsArgs,
  type PreviewDetail,
  PreviewDetail as PreviewDetailSchema,
  type PreviewList,
  PreviewList as PreviewListSchema,
  PreviewView,
  RollbackPreviewArgs,
  UpdatePreviewArgs,
} from "@html-preview/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deletePreview } from "../../domain/delete";
import { updatePreview } from "../../domain/preview-admin";
import { getPreview, listPreviews } from "../../domain/queries";
import { rollback } from "../../domain/rollback";
import { toDeploymentView, toPreviewView } from "../../routes/previews/views";
import { type McpEnv, guarded, ok } from "../result";

const read = { readOnlyHint: true, openWorldHint: false };
const change = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function registerManageTools(server: McpServer, env: McpEnv): void {
  const { config, deps } = env.ctx;

  server.registerTool(
    "list_previews",
    {
      title: "List previews",
      description: "List deployed previews with their URLs, optionally filtered by name.",
      inputSchema: ListPreviewsArgs.shape,
      outputSchema: PreviewListSchema.shape,
      annotations: read,
    },
    (args) =>
      guarded(env, "read", () => {
        const listing = listPreviews(deps, {
          ...(args.query ? { q: args.query } : {}),
          limit: args.limit ?? 50,
        });
        const body: PreviewList = {
          previews: listing.items.map((item) =>
            toPreviewView(config, item.preview, item.deployment),
          ),
          nextCursor: listing.nextCursor,
        };
        const lines = body.previews.map((preview) => `${preview.name}: ${preview.url}`);
        return ok(lines.length ? lines.join("\n") : "No previews yet.", body);
      }),
  );

  server.registerTool(
    "get_preview",
    {
      title: "Get a preview",
      description: "Show one preview with its URL and deployment history.",
      inputSchema: GetPreviewArgs.shape,
      outputSchema: PreviewDetailSchema.shape,
      annotations: read,
    },
    (args) =>
      guarded(env, "read", () => {
        const { preview, deployments } = getPreview(deps, args.name);
        const current = deployments.find((item) => item.id === preview.currentDeploymentId) ?? null;
        const body: PreviewDetail = {
          preview: toPreviewView(config, preview, current),
          deployments: deployments.map((item) => toDeploymentView(config, preview, item)),
        };
        return ok(
          `${body.preview.url} — "${preview.name}", ${deployments.length} deployments.`,
          body,
        );
      }),
  );

  server.registerTool(
    "update_preview",
    {
      title: "Update a preview",
      description:
        "Change visibility, expiry (ttlHours, 0 = never) or pinned of an existing preview.",
      inputSchema: UpdatePreviewArgs.shape,
      outputSchema: PreviewView.shape,
      annotations: change,
    },
    (args) =>
      guarded(env, "deploy", () => {
        const preview = updatePreview(deps, {
          name: args.name,
          ...(args.visibility ? { visibility: args.visibility } : {}),
          ...(args.ttlHours !== undefined ? { ttlHours: args.ttlHours } : {}),
          ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
        });
        const current = preview.currentDeploymentId
          ? deps.deployments.findSummary(preview.currentDeploymentId)
          : null;
        const view = toPreviewView(config, preview, current);
        return ok(`${view.url} — updated "${preview.name}".`, view);
      }),
  );

  server.registerTool(
    "rollback_preview",
    {
      title: "Roll back a preview",
      description: "Point a preview at its previous deployment, or at a given deploymentId.",
      inputSchema: RollbackPreviewArgs.shape,
      outputSchema: PreviewView.shape,
      annotations: change,
    },
    (args) =>
      guarded(env, "deploy", () => {
        const result = rollback(deps, {
          name: args.name,
          ...(args.deploymentId ? { deploymentId: args.deploymentId } : {}),
        });
        const view = toPreviewView(config, result.preview, result.deployment);
        return ok(`${view.url} — rolled "${args.name}" back to ${result.deployment.id}.`, view);
      }),
  );

  server.registerTool(
    "delete_preview",
    {
      title: "Delete a preview",
      description: "Permanently delete a preview and all its deployments.",
      inputSchema: DeletePreviewArgs.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) =>
      guarded(env, "deploy", () => {
        deletePreview(deps, args.name);
        return { content: [{ type: "text", text: `Deleted "${args.name}".` }] };
      }),
  );
}
