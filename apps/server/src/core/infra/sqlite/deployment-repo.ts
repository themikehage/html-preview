// SPDX-License-Identifier: MIT

import type { Database } from "bun:sqlite";
import type {
  Deployment,
  DeploymentStatus,
  DeploymentSummary,
  ManifestFile,
} from "@html-preview/shared";
import type { DeploymentRepo } from "../../ports/deployment-repo.port";

interface DeploymentRow {
  id: string;
  preview_id: string;
  entry: string;
  message: string | null;
  bytes: number;
  file_count: number;
  uploaded: number;
  status: DeploymentStatus;
  created_by: string;
  created_at: string;
}

interface FileRow {
  path: string;
  hash: string;
  size: number;
  content_type: string;
}

function toSummary(row: DeploymentRow): DeploymentSummary {
  return {
    id: row.id,
    previewId: row.preview_id,
    entry: row.entry,
    message: row.message,
    bytes: row.bytes,
    fileCount: row.file_count,
    uploaded: row.uploaded,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export class SqliteDeploymentRepo implements DeploymentRepo {
  constructor(private readonly db: Database) {}

  create(deployment: Deployment): void {
    this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO deployments (id, preview_id, entry, message, bytes, file_count, uploaded, status, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          deployment.id,
          deployment.previewId,
          deployment.entry,
          deployment.message,
          deployment.bytes,
          deployment.fileCount,
          deployment.uploaded,
          deployment.status,
          deployment.createdBy,
          deployment.createdAt,
        );
      const insertFile = this.db.query(
        "INSERT INTO deployment_files (deployment_id, path, hash, size, content_type) VALUES (?, ?, ?, ?, ?)",
      );
      for (const [path, file] of Object.entries(deployment.files)) {
        insertFile.run(deployment.id, path, file.hash, file.size, file.contentType);
      }
    })();
  }

  findSummary(id: string): DeploymentSummary | null {
    const row = this.db
      .query<DeploymentRow, [string]>("SELECT * FROM deployments WHERE id = ?")
      .get(id);
    return row ? toSummary(row) : null;
  }

  findFile(id: string, path: string): ManifestFile | null {
    const row = this.db
      .query<FileRow, [string, string]>(
        "SELECT path, hash, size, content_type FROM deployment_files WHERE deployment_id = ? AND path = ?",
      )
      .get(id, path);
    return row ? { hash: row.hash, size: row.size, contentType: row.content_type } : null;
  }

  find(id: string): Deployment | null {
    const summary = this.findSummary(id);
    if (!summary) return null;
    const files = this.db
      .query<FileRow, [string]>(
        "SELECT path, hash, size, content_type FROM deployment_files WHERE deployment_id = ? ORDER BY path",
      )
      .all(id);
    const manifest: Deployment["files"] = {};
    for (const file of files) {
      manifest[file.path] = { hash: file.hash, size: file.size, contentType: file.content_type };
    }
    return { ...summary, files: manifest };
  }

  listReady(previewId: string): DeploymentSummary[] {
    return this.db
      .query<DeploymentRow, [string]>(
        "SELECT * FROM deployments WHERE preview_id = ? AND status = 'ready' ORDER BY created_at DESC, rowid DESC",
      )
      .all(previewId)
      .map(toSummary);
  }

  markReady(id: string): void {
    this.db.query("UPDATE deployments SET status = 'ready' WHERE id = ?").run(id);
  }
}
