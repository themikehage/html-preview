// SPDX-License-Identifier: MIT

import type { DomainDeps } from "../core/ports/deps";
import { type GcReport, collectGarbage } from "./gc";

/** A `pending` deployment older than this was abandoned by its client. */
export const PENDING_GRACE_MS = 3_600_000;

export interface ReaperReport extends GcReport {
  expiredPreviews: number;
  stalePending: number;
  abandonedPreviews: number;
  prunedDeployments: number;
}

export interface ReaperOptions {
  pendingGraceMs?: number;
  blobGraceMs?: number;
}

/**
 * One idempotent sweep: expired previews, abandoned plans, deployments beyond
 * KEEP_DEPLOYMENTS, then blob GC. Interrupting it at any point is safe to repeat.
 */
export async function runReaper(
  deps: DomainDeps,
  options: ReaperOptions = {},
): Promise<ReaperReport> {
  const now = deps.clock.now();
  const pendingCutoff = new Date(now.getTime() - (options.pendingGraceMs ?? PENDING_GRACE_MS));
  const db = deps.tx.run(() => {
    const expired = deps.previews.listExpired(now.toISOString());
    for (const preview of expired) deps.previews.delete(preview.id);
    const stalePending = deps.deployments.deleteStalePending(pendingCutoff.toISOString());
    const abandoned = deps.previews.deleteAbandoned(pendingCutoff.toISOString());
    const prunable = deps.deployments.listPrunable(deps.quotas.keepDeployments);
    for (const id of prunable) deps.deployments.delete(id);
    return {
      expiredPreviews: expired.length,
      stalePending,
      abandonedPreviews: abandoned,
      prunedDeployments: prunable.length,
    };
  });
  return { ...db, ...(await collectGarbage(deps, options.blobGraceMs)) };
}
