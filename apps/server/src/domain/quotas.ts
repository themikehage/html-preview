// SPDX-License-Identifier: MIT

import type { Manifest } from "@html-preview/shared";
import { Conflict, PayloadTooLarge } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";

const mb = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`;

export function assertManifestWithinQuotas(
  deps: DomainDeps,
  manifest: Manifest,
  missingHashes: string[],
): void {
  const { maxDeployFiles, maxDeployBytes } = deps.quotas;
  const entries = Object.values(manifest);
  if (entries.length > maxDeployFiles) {
    throw new PayloadTooLarge(
      `Deployment has ${entries.length} files; the limit is ${maxDeployFiles}`,
      "Deploy fewer files (bundle assets) or ask the operator to raise MAX_DEPLOY_FILES",
      "TOO_MANY_FILES",
    );
  }
  const bytes = entries.reduce((total, file) => total + file.size, 0);
  if (bytes > maxDeployBytes) {
    throw new PayloadTooLarge(
      `Deployment is ${mb(bytes)}; the limit is ${mb(maxDeployBytes)}`,
      "Deploy fewer or smaller files (compress images) or ask the operator to raise MAX_DEPLOY_BYTES",
      "DEPLOY_TOO_LARGE",
    );
  }
  const sizeByHash = new Map(entries.map((file) => [file.hash, file.size]));
  const incoming = missingHashes.reduce((total, hash) => total + (sizeByHash.get(hash) ?? 0), 0);
  assertRoomFor(deps, incoming);
}

/** Throws INSTANCE_FULL when storing `incomingBytes` more would exceed MAX_TOTAL_BYTES. */
export function assertRoomFor(deps: DomainDeps, incomingBytes: number): void {
  const used = deps.deployments.referencedBytes();
  if (used + incomingBytes > deps.quotas.maxTotalBytes) {
    throw new Conflict(
      `Instance storage is full: ${mb(used)} used of ${mb(deps.quotas.maxTotalBytes)}`,
      "Delete previews you no longer need, wait for expired ones to be reaped, or raise MAX_TOTAL_BYTES",
      "INSTANCE_FULL",
    );
  }
}
