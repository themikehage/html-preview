// SPDX-License-Identifier: MIT

import type { Database } from "bun:sqlite";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Backup, BackupFile } from "../../ports/backup.port";

export class SqliteBackup implements Backup {
  constructor(
    private readonly db: Database,
    private readonly dir: string,
  ) {}

  snapshot(name: string): BackupFile {
    mkdirSync(this.dir, { recursive: true });
    const file = join(this.dir, name);
    // VACUUM INTO refuses to overwrite and takes a consistent read snapshot under WAL.
    this.db.query("VACUUM INTO ?").run(file);
    return { name, bytes: statSync(file).size };
  }
}
