// SPDX-License-Identifier: MIT

import type { Database } from "bun:sqlite";
import type { Preview, Visibility } from "@html-preview/shared";
import type { PreviewListQuery, PreviewPatch, PreviewRepo } from "../../ports/preview-repo.port";

interface PreviewRow {
  id: string;
  name: string;
  visibility: Visibility;
  expires_at: string | null;
  pinned: number;
  spa: number;
  current_deployment_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toPreview(row: PreviewRow): Preview {
  return {
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    expiresAt: row.expires_at,
    pinned: row.pinned === 1,
    spa: row.spa === 1,
    currentDeploymentId: row.current_deployment_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqlitePreviewRepo implements PreviewRepo {
  constructor(private readonly db: Database) {}

  findByName(name: string): Preview | null {
    const row = this.db
      .query<PreviewRow, [string]>("SELECT * FROM previews WHERE name = ?")
      .get(name);
    return row ? toPreview(row) : null;
  }

  findById(id: string): Preview | null {
    const row = this.db.query<PreviewRow, [string]>("SELECT * FROM previews WHERE id = ?").get(id);
    return row ? toPreview(row) : null;
  }

  list(query: PreviewListQuery): Preview[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (query.q) {
      where.push("name LIKE ? ESCAPE '\\'");
      params.push(`%${query.q.replace(/[\\%_]/g, "\\$&")}%`);
    }
    if (query.createdBy) {
      where.push("created_by = ?");
      params.push(query.createdBy);
    }
    if (query.after) {
      where.push("name > ?");
      params.push(query.after);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    return this.db
      .query<PreviewRow, (string | number)[]>(
        `SELECT * FROM previews ${clause} ORDER BY name LIMIT ?`,
      )
      .all(...params, query.limit)
      .map(toPreview);
  }

  update(id: string, patch: PreviewPatch, updatedAt: string): void {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(patch.name);
    }
    if (patch.visibility !== undefined) {
      sets.push("visibility = ?");
      params.push(patch.visibility);
    }
    if (patch.expiresAt !== undefined) {
      sets.push("expires_at = ?");
      params.push(patch.expiresAt);
    }
    if (patch.pinned !== undefined) {
      sets.push("pinned = ?");
      params.push(patch.pinned ? 1 : 0);
    }
    if (patch.spa !== undefined) {
      sets.push("spa = ?");
      params.push(patch.spa ? 1 : 0);
    }
    sets.push("updated_at = ?");
    params.push(updatedAt, id);
    this.db.query(`UPDATE previews SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  create(preview: Preview): void {
    this.db
      .query(
        `INSERT INTO previews (id, name, visibility, expires_at, pinned, spa, current_deployment_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        preview.id,
        preview.name,
        preview.visibility,
        preview.expiresAt,
        preview.pinned ? 1 : 0,
        preview.spa ? 1 : 0,
        preview.currentDeploymentId,
        preview.createdBy,
        preview.createdAt,
        preview.updatedAt,
      );
  }

  setCurrentDeployment(id: string, deploymentId: string, updatedAt: string): void {
    this.db
      .query("UPDATE previews SET current_deployment_id = ?, updated_at = ? WHERE id = ?")
      .run(deploymentId, updatedAt, id);
  }

  delete(id: string): void {
    this.db.query("DELETE FROM previews WHERE id = ?").run(id);
  }

  count(): number {
    return (
      this.db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM previews").get()?.total ??
      0
    );
  }

  listExpired(now: string): Preview[] {
    return this.db
      .query<PreviewRow, [string]>(
        "SELECT * FROM previews WHERE pinned = 0 AND expires_at IS NOT NULL AND expires_at <= ?",
      )
      .all(now)
      .map(toPreview);
  }

  deleteAbandoned(before: string): number {
    return this.db
      .query(
        `DELETE FROM previews
         WHERE current_deployment_id IS NULL AND created_at < ?
           AND NOT EXISTS (SELECT 1 FROM deployments WHERE deployments.preview_id = previews.id)
         RETURNING id`,
      )
      .all(before).length;
  }
}
