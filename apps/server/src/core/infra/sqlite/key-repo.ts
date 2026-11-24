// SPDX-License-Identifier: MIT

import type { Database } from "bun:sqlite";
import { Scope } from "@html-preview/shared";
import type { KeyRepo, StoredApiKey } from "../../ports/key-repo.port";

interface KeyRow {
  id: string;
  label: string;
  hash: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
}

function toKey(row: KeyRow): StoredApiKey {
  return {
    id: row.id,
    label: row.label,
    hash: row.hash,
    scopes: row.scopes.split(",").map((scope) => Scope.parse(scope)),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export class SqliteKeyRepo implements KeyRepo {
  constructor(private readonly db: Database) {}

  create(key: StoredApiKey): void {
    this.db
      .query(
        "INSERT INTO api_keys (id, label, hash, scopes, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(key.id, key.label, key.hash, key.scopes.join(","), key.createdAt, key.lastUsedAt);
  }

  findByHash(hash: string): StoredApiKey | null {
    const row = this.db.query<KeyRow, [string]>("SELECT * FROM api_keys WHERE hash = ?").get(hash);
    return row ? toKey(row) : null;
  }

  touch(id: string, at: string): void {
    this.db.query("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(at, id);
  }

  count(): number {
    return (
      this.db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM api_keys").get()?.total ??
      0
    );
  }
}
