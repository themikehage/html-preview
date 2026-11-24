// SPDX-License-Identifier: MIT

import type { Database } from "bun:sqlite";
import type { Preview, Visibility } from "@html-preview/shared";
import type { PreviewRepo } from "../../ports/preview-repo.port";

interface PreviewRow {
  id: string;
  name: string;
  visibility: Visibility;
  expires_at: string | null;
  pinned: number;
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

  create(preview: Preview): void {
    this.db
      .query(
        `INSERT INTO previews (id, name, visibility, expires_at, pinned, current_deployment_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        preview.id,
        preview.name,
        preview.visibility,
        preview.expiresAt,
        preview.pinned ? 1 : 0,
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
}
