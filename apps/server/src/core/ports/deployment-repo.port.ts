// SPDX-License-Identifier: MIT

import type { Deployment, DeploymentSummary } from "@html-preview/shared";

export interface DeploymentRepo {
  create(deployment: Deployment): void;
  find(id: string): Deployment | null;
  listReady(previewId: string): DeploymentSummary[];
  markReady(id: string): void;
}
