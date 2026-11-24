// SPDX-License-Identifier: MIT

import { readdirSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";

/** Files in the blob store carry real mtimes; push them back so GC grace checks see old files. */
export function ageBlobs(dataDir: string, olderThan: Date): void {
  const root = join(dataDir, "blobs");
  for (const relative of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    const file = join(root, relative);
    if (statSync(file).isFile()) utimesSync(file, olderThan, olderThan);
  }
}

export function blobFiles(dataDir: string): string[] {
  const root = join(dataDir, "blobs");
  try {
    return readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
      (relative) => !relative.startsWith(".tmp") && statSync(join(root, relative)).isFile(),
    );
  } catch {
    return [];
  }
}
