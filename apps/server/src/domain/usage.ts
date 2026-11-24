// SPDX-License-Identifier: MIT

import type { Usage } from "@html-preview/shared";
import type { DomainDeps } from "../core/ports/deps";

export function getUsage(deps: DomainDeps): Usage {
  const storedBytes = deps.deployments.referencedBytes();
  const byCreator = new Map(deps.deployments.usageByCreator().map((row) => [row.createdBy, row]));
  return {
    totals: {
      previews: deps.previews.count(),
      deployments: deps.deployments.count(),
      storedBytes,
    },
    quota: {
      ...deps.quotas,
      remainingBytes: Math.max(0, deps.quotas.maxTotalBytes - storedBytes),
    },
    keys: deps.keys.list().map((key) => ({
      id: key.id,
      label: key.label,
      scopes: key.scopes,
      lastUsedAt: key.lastUsedAt,
      deployments: byCreator.get(key.label)?.deployments ?? 0,
      bytes: byCreator.get(key.label)?.bytes ?? 0,
    })),
  };
}
