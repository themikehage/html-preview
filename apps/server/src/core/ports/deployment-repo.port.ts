// SPDX-License-Identifier: MIT

import type { Deployment, DeploymentSummary, ManifestFile } from "@html-preview/shared";

export interface DeploymentRepo {
  create(deployment: Deployment): void;
  find(id: string): Deployment | null;
  findSummary(id: string): DeploymentSummary | null;
  findFile(id: string, path: string): ManifestFile | null;
  listReady(previewId: string): DeploymentSummary[];
  markReady(id: string): void;
  delete(id: string): void;
  /** Ready deployments beyond the newest `keep` of each preview, never the current one. */
  listPrunable(keep: number): string[];
  /** Deletes `pending` deployments created before `before` (ISO); returns how many. */
  deleteStalePending(before: string): number;
  isHashReferenced(hash: string): boolean;
  count(): number;
  /** Bytes of distinct blobs referenced by any deployment (pending included). */
  referencedBytes(): number;
  usageByCreator(): { createdBy: string; deployments: number; bytes: number }[];
}
