// SPDX-License-Identifier: MIT

import { NotFound } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";

export function deletePreview(deps: DomainDeps, name: string): void {
  const preview = deps.previews.findByName(name);
  if (!preview) throw new NotFound(`Preview "${name}" not found`, undefined, "PREVIEW_NOT_FOUND");
  deps.previews.delete(preview.id);
}
