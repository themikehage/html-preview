// SPDX-License-Identifier: MIT

import { z } from "zod";
import { CreateLinkRequest } from "./links";
import { PreviewName, Visibility } from "./preview";

const ttlHours = z
  .number()
  .int()
  .min(0)
  .max(24 * 365 * 10)
  .describe("Hours until the preview expires; 0 = never. Omit for the instance default");
const name = PreviewName.describe(
  "Preview name: lowercase letters, digits and hyphens (e.g. 'landing-v2'). Re-deploying the same name updates it",
);
const visibility = Visibility.describe(
  "unlisted (default), public, or private (reachable only through a share link)",
);

export const DeployHtmlArgs = z.object({
  name,
  html: z.string().min(1).describe("A complete, self-contained HTML document"),
  visibility: visibility.optional(),
  ttlHours: ttlHours.optional(),
});

export const DeployFilesArgs = z.object({
  name,
  files: z
    .record(z.string().min(1), z.string())
    .describe(
      "Map of relative path to UTF-8 text content, e.g. {'index.html': '...', 'app.css': '...'}",
    ),
  entry: z.string().min(1).optional().describe("Entry file; defaults to index.html"),
  visibility: visibility.optional(),
  ttlHours: ttlHours.optional(),
});

export const ListPreviewsArgs = z.object({
  query: z.string().min(1).max(100).optional().describe("Substring of the preview name"),
  limit: z.number().int().min(1).max(200).optional(),
});

export const GetPreviewArgs = z.object({ name });

export const UpdatePreviewArgs = z.object({
  name,
  visibility: visibility.optional(),
  ttlHours: ttlHours.optional(),
  pinned: z.boolean().optional().describe("Pinned previews never expire"),
});

export const RollbackPreviewArgs = z.object({
  name,
  deploymentId: z.string().min(1).optional().describe("Defaults to the previous deployment"),
});

export const DeletePreviewArgs = z.object({ name });

export const SharePreviewArgs = z.object({
  name,
  expiresInHours: CreateLinkRequest.shape.expiresInHours.optional(),
  label: CreateLinkRequest.shape.label,
});

export const RevokeShareArgs = z.object({
  name,
  linkId: z.string().min(1).describe("The id returned by share_preview"),
});

/** Every MCP tool name, in registration order.  */
export const MCP_TOOL_NAMES = [
  "deploy_html",
  "deploy_files",
  "list_previews",
  "get_preview",
  "update_preview",
  "rollback_preview",
  "delete_preview",
  "share_preview",
  "revoke_share",
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];
