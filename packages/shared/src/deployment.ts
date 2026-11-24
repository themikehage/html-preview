// SPDX-License-Identifier: MIT

import { z } from "zod";
import { Manifest } from "./manifest";

export const DeploymentStatus = z.enum(["pending", "ready"]);
export type DeploymentStatus = z.infer<typeof DeploymentStatus>;

export const DeploymentSummary = z.object({
  id: z.string(),
  previewId: z.string(),
  entry: z.string(),
  message: z.string().nullable(),
  bytes: z.number().int().nonnegative(),
  fileCount: z.number().int().positive(),
  status: DeploymentStatus,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type DeploymentSummary = z.infer<typeof DeploymentSummary>;

export const Deployment = DeploymentSummary.extend({ files: Manifest });
export type Deployment = z.infer<typeof Deployment>;
