// SPDX-License-Identifier: MIT

import { z } from "zod";
import { DeploymentSummary } from "./deployment";
import { ManifestInput, Sha256 } from "./manifest";
import { Preview, PreviewName, Visibility } from "./preview";

const TTL_HOURS_MAX = 24 * 365 * 10;
const Ttl = z.number().int().min(0).max(TTL_HOURS_MAX);
const Message = z.string().max(500);

export const DeployQuery = z.object({
  visibility: Visibility.optional(),
  ttl: z.coerce.number().pipe(Ttl).optional(),
  entry: z.string().min(1).optional(),
  message: Message.optional(),
});
export type DeployQuery = z.infer<typeof DeployQuery>;

export const NameParam = z.object({ name: PreviewName });
export const DeploymentParam = z.object({ name: PreviewName, id: z.string().min(1) });
export const BlobParam = z.object({ sha256: Sha256 });

export const PlanDeploymentRequest = z.object({
  files: ManifestInput,
  entry: z.string().min(1).optional(),
  message: Message.optional(),
  visibility: Visibility.optional(),
  ttl: Ttl.optional(),
});
export type PlanDeploymentRequest = z.infer<typeof PlanDeploymentRequest>;

export const PlanDeploymentResponse = z.object({
  deploymentId: z.string(),
  missing: z.array(Sha256),
});
export type PlanDeploymentResponse = z.infer<typeof PlanDeploymentResponse>;

export const BlobResponse = z.object({ hash: Sha256, stored: z.literal(true) });
export type BlobResponse = z.infer<typeof BlobResponse>;

export const UpdatePreviewRequest = z
  .object({
    visibility: Visibility.optional(),
    ttl: Ttl.optional(),
    pinned: z.boolean().optional(),
    name: PreviewName.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "at least one field is required");
export type UpdatePreviewRequest = z.infer<typeof UpdatePreviewRequest>;

export const RollbackRequest = z.object({ deploymentId: z.string().min(1).optional() });
export type RollbackRequest = z.infer<typeof RollbackRequest>;

export const ListPreviewsQuery = z.object({
  q: z.string().min(1).max(100).optional(),
  createdBy: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListPreviewsQuery = z.infer<typeof ListPreviewsQuery>;

export const FilesQuery = z.object({ deployment: z.string().min(1).optional() });

export const PreviewView = Preview.extend({
  url: z.string().url(),
  deployment: DeploymentSummary.nullable(),
});
export type PreviewView = z.infer<typeof PreviewView>;

export const PreviewList = z.object({
  previews: z.array(PreviewView),
  nextCursor: z.string().nullable(),
});
export type PreviewList = z.infer<typeof PreviewList>;

export const DeploymentView = DeploymentSummary.extend({
  url: z.string().url(),
  current: z.boolean(),
});
export type DeploymentView = z.infer<typeof DeploymentView>;

export const PreviewDetail = z.object({
  preview: PreviewView,
  deployments: z.array(DeploymentView),
});
export type PreviewDetail = z.infer<typeof PreviewDetail>;
