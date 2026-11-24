// SPDX-License-Identifier: MIT

import type { Preview, Visibility } from "@html-preview/shared";

export interface PreviewListQuery {
  q?: string;
  createdBy?: string;
  after?: string;
  limit: number;
}

export interface PreviewPatch {
  name?: string;
  visibility?: Visibility;
  expiresAt?: string | null;
  pinned?: boolean;
}

export interface PreviewRepo {
  findByName(name: string): Preview | null;
  findById(id: string): Preview | null;
  list(query: PreviewListQuery): Preview[];
  create(preview: Preview): void;
  update(id: string, patch: PreviewPatch, updatedAt: string): void;
  setCurrentDeployment(id: string, deploymentId: string, updatedAt: string): void;
  delete(id: string): void;
}
