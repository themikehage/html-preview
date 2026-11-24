// SPDX-License-Identifier: MIT

import type { Preview, PreviewName, Visibility } from "@html-preview/shared";
import { Conflict, NotFound } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";
import type { PreviewPatch } from "../core/ports/preview-repo.port";
import { assertVisibilityAllowed, expiryFrom } from "./visibility";

export interface UpdatePreviewInput {
  name: string;
  visibility?: Visibility;
  ttlHours?: number;
  pinned?: boolean;
  newName?: PreviewName;
}

export function requirePreview(deps: DomainDeps, name: string): Preview {
  const preview = deps.previews.findByName(name);
  if (!preview) throw new NotFound(`Preview "${name}" not found`, undefined, "PREVIEW_NOT_FOUND");
  return preview;
}

export function updatePreview(deps: DomainDeps, input: UpdatePreviewInput): Preview {
  const preview = requirePreview(deps, input.name);
  if (input.visibility) assertVisibilityAllowed(input.visibility, deps.maxVisibility);
  const now = deps.clock.now();
  const patch: PreviewPatch = {
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.ttlHours !== undefined ? { expiresAt: expiryFrom(now, input.ttlHours) } : {}),
    ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
    ...(input.newName !== undefined ? { name: input.newName } : {}),
  };
  const updatedAt = now.toISOString();
  deps.tx.run(() => {
    if (
      input.newName &&
      input.newName !== preview.name &&
      deps.previews.findByName(input.newName)
    ) {
      throw new Conflict(
        `Preview "${input.newName}" already exists`,
        "Pick another name",
        "NAME_TAKEN",
      );
    }
    deps.previews.update(preview.id, patch, updatedAt);
  });
  return requirePreview(deps, input.newName ?? input.name);
}
