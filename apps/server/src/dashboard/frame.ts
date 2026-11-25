// SPDX-License-Identifier: MIT

import type { Preview } from "@html-preview/shared";
import type { DomainDeps } from "../core/ports/deps";
import { mintTicket } from "../domain/capability";
import { effectiveVisibility } from "../domain/visibility";

/**
 * Content URL the dashboard sends the owner to. Private previews get a 60-second signed
 * ticket in the path; the content server swaps it for a longer-lived capability.
 */
export function contentUrlFor(deps: DomainDeps, preview: Preview, deploymentId?: string): string {
  const segment = deploymentId ? `${preview.id}@${deploymentId}` : preview.id;
  const base = `${deps.contentOrigin}/${segment}/`;
  if (effectiveVisibility(preview.visibility, deps.maxVisibility) !== "private") return base;
  return `${base}~${mintTicket(deps.signingSecret, preview.id, deps.clock.now())}/`;
}
