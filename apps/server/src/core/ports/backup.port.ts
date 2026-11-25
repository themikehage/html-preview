// SPDX-License-Identifier: MIT

export interface BackupFile {
  name: string;
  bytes: number;
}

export interface Backup {
  /** Writes a consistent snapshot of the database as `<name>` in the backups directory. */
  snapshot(name: string): BackupFile;
}
