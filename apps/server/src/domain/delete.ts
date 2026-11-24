// SPDX-License-Identifier: MIT

import type { DomainDeps } from "../core/ports/deps";
import { requirePreview } from "./preview-admin";

export function deletePreview(deps: DomainDeps, name: string): void {
  deps.previews.delete(requirePreview(deps, name).id);
}
