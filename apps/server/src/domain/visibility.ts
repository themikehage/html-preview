// SPDX-License-Identifier: MIT

import type { Visibility } from "@html-preview/shared";
import { BadRequest } from "../core/infra/errors";

const OPENNESS: Record<Visibility, number> = { private: 0, unlisted: 1, public: 2 };

export function defaultVisibility(max: Visibility): Visibility {
  return OPENNESS.unlisted <= OPENNESS[max] ? "unlisted" : max;
}

/** What is actually enforced: a stored visibility can never be more open than the ceiling. */
export function effectiveVisibility(stored: Visibility, max: Visibility): Visibility {
  return OPENNESS[stored] <= OPENNESS[max] ? stored : max;
}

export function assertVisibilityAllowed(visibility: Visibility, max: Visibility): void {
  if (OPENNESS[visibility] <= OPENNESS[max]) return;
  throw new BadRequest(
    `Visibility "${visibility}" is above this instance's ceiling "${max}"`,
    `Use "${max}" or a more restrictive visibility`,
    "VISIBILITY_NOT_ALLOWED",
  );
}

export function expiryFrom(now: Date, ttlHours: number): string | null {
  return ttlHours > 0 ? new Date(now.getTime() + ttlHours * 3_600_000).toISOString() : null;
}
