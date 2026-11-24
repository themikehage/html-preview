// SPDX-License-Identifier: MIT

import type { DomainDeps } from "../core/ports/deps";

/** Unreferenced blobs younger than this are kept: an upload may be waiting for its plan. */
export const BLOB_GRACE_MS = 3_600_000;

export interface GcReport {
  blobsDeleted: number;
  bytesFreed: number;
  tempFilesRemoved: number;
}

/**
 * Removes blobs no deployment references. The reference check runs per blob right
 * before deleting, so a deployment planned during the sweep keeps its blobs.
 */
export async function collectGarbage(deps: DomainDeps, graceMs = BLOB_GRACE_MS): Promise<GcReport> {
  const cutoff = new Date(deps.clock.now().getTime() - graceMs);
  const report: GcReport = { blobsDeleted: 0, bytesFreed: 0, tempFilesRemoved: 0 };
  for await (const blob of deps.blobs.list()) {
    if (blob.modifiedAt > cutoff || deps.deployments.isHashReferenced(blob.hash)) continue;
    await deps.blobs.delete(blob.hash);
    report.blobsDeleted += 1;
    report.bytesFreed += blob.size;
  }
  report.tempFilesRemoved = await deps.blobs.cleanTemp(cutoff);
  return report;
}
