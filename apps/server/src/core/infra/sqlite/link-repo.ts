// SPDX-License-Identifier: MIT

import type { Database } from "bun:sqlite";
import type { LinkRepo, StoredLink } from "../../ports/link-repo.port";

interface Row {
  id: string;
  preview_id: string;
  token_hash: string;
  label: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  access_count: number;
  last_accessed_at: string | null;
}

function toLink(row: Row): StoredLink {
  return {
    id: row.id,
    previewId: row.preview_id,
    tokenHash: row.token_hash,
    label: row.label,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at,
  };
}

export class SqliteLinkRepo implements LinkRepo {
  constructor(private readonly db: Database) {}

  create(link: StoredLink): void {
    this.db
      .query(
        `INSERT INTO share_links (id, preview_id, token_hash, label, created_by, created_at, expires_at, revoked_at, access_count, last_accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        link.id,
        link.previewId,
        link.tokenHash,
        link.label,
        link.createdBy,
        link.createdAt,
        link.expiresAt,
        link.revokedAt,
        link.accessCount,
        link.lastAccessedAt,
      );
  }

  findById(id: string): StoredLink | null {
    const row = this.db.query<Row, [string]>("SELECT * FROM share_links WHERE id = ?").get(id);
    return row ? toLink(row) : null;
  }

  findByTokenHash(hash: string): StoredLink | null {
    const row = this.db
      .query<Row, [string]>("SELECT * FROM share_links WHERE token_hash = ?")
      .get(hash);
    return row ? toLink(row) : null;
  }

  listByPreview(previewId: string): StoredLink[] {
    return this.db
      .query<Row, [string]>(
        "SELECT * FROM share_links WHERE preview_id = ? ORDER BY created_at DESC",
      )
      .all(previewId)
      .map(toLink);
  }

  countActive(previewId: string, now: string): number {
    const row = this.db
      .query<{ total: number }, [string, string]>(
        "SELECT COUNT(*) AS total FROM share_links WHERE preview_id = ? AND revoked_at IS NULL AND expires_at > ?",
      )
      .get(previewId, now);
    return row?.total ?? 0;
  }

  revoke(id: string, at: string): void {
    this.db
      .query("UPDATE share_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(at, id);
  }

  revokeAll(previewId: string, at: string): void {
    this.db
      .query("UPDATE share_links SET revoked_at = ? WHERE preview_id = ? AND revoked_at IS NULL")
      .run(at, previewId);
  }

  recordAccess(id: string, at: string): void {
    this.db
      .query(
        "UPDATE share_links SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?",
      )
      .run(at, id);
  }
}
