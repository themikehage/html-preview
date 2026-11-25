// SPDX-License-Identifier: MIT

import type { Config } from "./config";
import { deploymentToLabel, idToLabel } from "./labels";

export interface ContentBase {
  contentOrigin: string;
  contentMode: "path" | "subdomain";
}

export function contentBaseOf(
  config: Pick<Config, "CONTENT_ORIGIN" | "CONTENT_MODE">,
): ContentBase {
  return { contentOrigin: config.CONTENT_ORIGIN, contentMode: config.CONTENT_MODE };
}

export interface ContentUrlOptions {
  deploymentId?: string;
  /** Share token or owner ticket; ends up as the `~<token>/` first path segment. */
  token?: string;
}

/**
 * Public URL of a preview. Path mode: `<origin>/<id>[@<dep>]/`. Subdomain mode:
 * `<scheme>://<label>[--<dep label>].<host>/` (see labels.ts for why ids are re-encoded).
 */
export function contentUrl(
  base: ContentBase,
  previewId: string,
  options: ContentUrlOptions = {},
): string {
  const tail = options.token ? `~${options.token}/` : "";
  if (base.contentMode === "path") {
    const segment = options.deploymentId ? `${previewId}@${options.deploymentId}` : previewId;
    return `${base.contentOrigin}/${segment}/${tail}`;
  }
  const label = idToLabel(previewId);
  const pinned = options.deploymentId ? deploymentToLabel(options.deploymentId) : null;
  if (!label || (options.deploymentId && !pinned)) {
    throw new Error(`Cannot build a subdomain for ${previewId}`);
  }
  const { protocol, host } = new URL(base.contentOrigin);
  return `${protocol}//${label}${pinned ? `--${pinned}` : ""}.${host}/${tail}`;
}

export function previewUrl(base: ContentBase, previewId: string): string {
  return contentUrl(base, previewId);
}

export function deploymentUrl(base: ContentBase, previewId: string, deploymentId: string): string {
  return contentUrl(base, previewId, { deploymentId });
}
