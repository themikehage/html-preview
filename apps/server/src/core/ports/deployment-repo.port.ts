// SPDX-License-Identifier: MIT

import type { Deployment, DeploymentSummary, ManifestFile } from "@html-preview/shared";

export interface DeploymentRepo {
  create(deployment: Deployment): void;
  find(id: string): Deployment | null;
  findSummary(id: string): DeploymentSummary | null;
  findFile(id: string, path: string): ManifestFile | null;
  listReady(previewId: string): DeploymentSummary[];
  markReady(id: string): void;
}
