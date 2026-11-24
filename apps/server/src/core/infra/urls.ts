// SPDX-License-Identifier: MIT

import type { Config } from "./config";

export function previewUrl(config: Pick<Config, "CONTENT_ORIGIN">, previewId: string): string {
  return `${config.CONTENT_ORIGIN}/${previewId}/`;
}

export function deploymentUrl(
  config: Pick<Config, "CONTENT_ORIGIN">,
  previewId: string,
  deploymentId: string,
): string {
  return `${config.CONTENT_ORIGIN}/${previewId}@${deploymentId}/`;
}
