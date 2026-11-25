// SPDX-License-Identifier: MIT

import { LINK_DEFAULT_HOURS, MAX_ACTIVE_LINKS } from "@html-preview/shared";
import { Conflict, NotFound } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";
import type { StoredLink } from "../core/ports/link-repo.port";
import { sha256Hex } from "./hash";
import { requirePreview } from "./preview-admin";
import { effectiveVisibility } from "./visibility";

export interface CreateLinkInput {
  name: string;
  expiresInHours?: number | undefined;
  label?: string | undefined;
  createdBy: string;
}

/** The secret URL; `${CONTENT_ORIGIN}/<id>/~<token>/`. Only ever returned at creation. */
export function shareUrl(deps: DomainDeps, previewId: string, token: string): string {
  return `${deps.contentOrigin}/${previewId}/~${token}/`;
}

export function createLink(
  deps: DomainDeps,
  input: CreateLinkInput,
): { link: StoredLink; url: string } {
  const preview = requirePreview(deps, input.name);
  if (effectiveVisibility(preview.visibility, deps.maxVisibility) !== "private") {
    throw new Conflict(
      `Preview "${preview.name}" is not private, so it is already reachable by its URL`,
      "Set visibility to private first (update_preview / PATCH), then create a share link",
      "PREVIEW_NOT_PRIVATE",
    );
  }
  const now = deps.clock.now();
  if (deps.links.countActive(preview.id, now.toISOString()) >= MAX_ACTIVE_LINKS) {
    throw new Conflict(
      `Preview "${preview.name}" already has ${MAX_ACTIVE_LINKS} active share links`,
      "Revoke a link you no longer need",
      "TOO_MANY_LINKS",
    );
  }
  const token = deps.ids.shareToken();
  const hours = input.expiresInHours ?? LINK_DEFAULT_HOURS;
  const link: StoredLink = {
    id: deps.ids.linkId(),
    previewId: preview.id,
    tokenHash: sha256Hex(token),
    label: input.label ?? null,
    createdBy: input.createdBy,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + hours * 3_600_000).toISOString(),
    revokedAt: null,
    accessCount: 0,
    lastAccessedAt: null,
  };
  deps.links.create(link);
  return { link, url: shareUrl(deps, preview.id, token) };
}

export function listLinks(deps: DomainDeps, name: string): StoredLink[] {
  return deps.links.listByPreview(requirePreview(deps, name).id);
}

export function revokeLink(deps: DomainDeps, name: string, id: string): void {
  const preview = requirePreview(deps, name);
  const link = deps.links.findById(id);
  if (!link || link.previewId !== preview.id) {
    throw new NotFound(
      `Share link "${id}" not found on "${name}"`,
      "List links with GET /v1/previews/:name/links",
      "LINK_NOT_FOUND",
    );
  }
  deps.links.revoke(id, deps.clock.now().toISOString());
}

export function isLinkActive(link: StoredLink, now: Date): boolean {
  return link.revokedAt === null && Date.parse(link.expiresAt) > now.getTime();
}

/** Validates a secret token for a preview and counts the access. Null when it is not usable. */
export function redeemLink(deps: DomainDeps, previewId: string, token: string): StoredLink | null {
  const link = deps.links.findByTokenHash(sha256Hex(token));
  const now = deps.clock.now();
  if (!link || link.previewId !== previewId || !isLinkActive(link, now)) return null;
  deps.links.recordAccess(link.id, now.toISOString());
  return link;
}
