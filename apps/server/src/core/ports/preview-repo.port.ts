// SPDX-License-Identifier: MIT

import type { Preview } from "@html-preview/shared";

export interface PreviewRepo {
  findByName(name: string): Preview | null;
  findById(id: string): Preview | null;
  create(preview: Preview): void;
  setCurrentDeployment(id: string, deploymentId: string, updatedAt: string): void;
  delete(id: string): void;
}
