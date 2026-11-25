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
  spa?: boolean;
}

export interface PreviewRepo {
  findByName(name: string): Preview | null;
  findById(id: string): Preview | null;
  list(query: PreviewListQuery): Preview[];
  create(preview: Preview): void;
  update(id: string, patch: PreviewPatch, updatedAt: string): void;
  setCurrentDeployment(id: string, deploymentId: string, updatedAt: string): void;
  delete(id: string): void;
  count(): number;
  /** Non-pinned previews whose expiry is at or before `now` (ISO). */
  listExpired(now: string): Preview[];
  /** Previews that never got a live deployment and have none left, created before `before` (ISO). */
  deleteAbandoned(before: string): number;
}
