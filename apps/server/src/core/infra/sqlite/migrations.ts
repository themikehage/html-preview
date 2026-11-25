// SPDX-License-Identifier: MIT

import type { Database } from "bun:sqlite";

const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE previews (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    visibility TEXT NOT NULL CHECK (visibility IN ('unlisted', 'private', 'public')),
    expires_at TEXT,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    current_deployment_id TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE deployments (
    id TEXT PRIMARY KEY,
    preview_id TEXT NOT NULL REFERENCES previews(id) ON DELETE CASCADE,
    entry TEXT NOT NULL,
    message TEXT,
    bytes INTEGER NOT NULL,
    file_count INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'ready')),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX deployments_preview_idx ON deployments (preview_id, created_at);
  CREATE TABLE deployment_files (
    deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    hash TEXT NOT NULL,
    size INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    PRIMARY KEY (deployment_id, path)
  );
  CREATE INDEX deployment_files_hash_idx ON deployment_files (hash);
  `,
  `
  ALTER TABLE deployments ADD COLUMN uploaded INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );
  `,
  `
  CREATE TABLE share_links (
    id TEXT PRIMARY KEY,
    preview_id TEXT NOT NULL REFERENCES previews(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    label TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TEXT
  );
  CREATE INDEX share_links_preview_idx ON share_links (preview_id);
  `,
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: Database): void {
  const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) continue;
    db.transaction(() => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    })();
  }
}
