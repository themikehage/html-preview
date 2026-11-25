// SPDX-License-Identifier: MIT

import type { BackupResult } from "@html-preview/shared";
import type { DomainDeps } from "../core/ports/deps";

export function createBackup(deps: DomainDeps): BackupResult {
  const createdAt = deps.clock.now().toISOString();
  const stamp = createdAt.replace(/[-:.]/g, "");
  const { name, bytes } = deps.backup.snapshot(`html-preview-${stamp}.sqlite`);
  return { name, bytes, createdAt };
}
