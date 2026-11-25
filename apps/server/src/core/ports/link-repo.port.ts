// SPDX-License-Identifier: MIT

export interface StoredLink {
  id: string;
  previewId: string;
  tokenHash: string;
  label: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
}

export interface LinkRepo {
  create(link: StoredLink): void;
  findById(id: string): StoredLink | null;
  findByTokenHash(hash: string): StoredLink | null;
  listByPreview(previewId: string): StoredLink[];
  /** Links neither revoked nor expired at `now` (ISO). */
  countActive(previewId: string, now: string): number;
  revoke(id: string, at: string): void;
  /** Revokes every still-active link of the preview. */
  revokeAll(previewId: string, at: string): void;
  recordAccess(id: string, at: string): void;
}
