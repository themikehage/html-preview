// SPDX-License-Identifier: MIT

import type { Preview } from "@html-preview/shared";
import { contentUrl } from "../core/infra/urls";
import type { DomainDeps } from "../core/ports/deps";
import { mintTicket } from "../domain/capability";
import { effectiveVisibility } from "../domain/visibility";

/**
 * Content URL the dashboard sends the owner to. Private previews get a 60-second signed
 * ticket in the path; the content server swaps it for a longer-lived capability.
 */
export function contentUrlFor(deps: DomainDeps, preview: Preview, deploymentId?: string): string {
  const priv = effectiveVisibility(preview.visibility, deps.maxVisibility) === "private";
  const token = priv ? mintTicket(deps.signingSecret, preview.id, deps.clock.now()) : undefined;
  return contentUrl(deps, preview.id, {
    ...(deploymentId ? { deploymentId } : {}),
    ...(token ? { token } : {}),
  });
}
