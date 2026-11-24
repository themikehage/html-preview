// SPDX-License-Identifier: MIT

import type { DeploymentSummary, Preview } from "@html-preview/shared";
import type { DomainDeps } from "../core/ports/deps";
import { requirePreview } from "./preview-admin";

export interface PreviewListing {
  items: { preview: Preview; deployment: DeploymentSummary | null }[];
  nextCursor: string | null;
}

export function listPreviews(
  deps: DomainDeps,
  query: { q?: string; createdBy?: string; cursor?: string; limit: number },
): PreviewListing {
  const rows = deps.previews.list({
    ...(query.q ? { q: query.q } : {}),
    ...(query.createdBy ? { createdBy: query.createdBy } : {}),
    ...(query.cursor ? { after: query.cursor } : {}),
    limit: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((preview) => ({
      preview,
      deployment: preview.currentDeploymentId
        ? deps.deployments.findSummary(preview.currentDeploymentId)
        : null,
    })),
    nextCursor: rows.length > query.limit && last ? last.name : null,
  };
}

export function getPreview(
  deps: DomainDeps,
  name: string,
): { preview: Preview; deployments: DeploymentSummary[] } {
  const preview = requirePreview(deps, name);
  return { preview, deployments: deps.deployments.listReady(preview.id) };
}
