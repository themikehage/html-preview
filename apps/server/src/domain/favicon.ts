// SPDX-License-Identifier: MIT

import type { Preview } from "@html-preview/shared";
import type { DomainDeps } from "../core/ports/deps";
import { normalizeManifestPath } from "./manifest-path";

export const MAX_FAVICON_BYTES = 256 * 1024;
const MAX_ENTRY_HTML_BYTES = 1024 * 1024;
const FALLBACK_NAMES = ["ico", "png", "svg", "gif", "jpg", "jpeg", "webp"].map(
  (extension) => `favicon.${extension}`,
);
const DATA_URI = /^data:(image\/[a-z0-9.+-]+)(;base64)?,(.*)$/is;
const SCHEME = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

export interface Favicon {
  contentType: string;
  bytes: Uint8Array;
}

function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of tag.matchAll(/([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    found.set((match[1] ?? "").toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return found;
}

function iconHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    const rel = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
    const href = attrs.get("href");
    if (href && (rel.includes("icon") || rel.join(" ") === "shortcut icon"))
      hrefs.push(href.trim());
  }
  return hrefs;
}

function fromDataUri(href: string): Favicon | null {
  const match = DATA_URI.exec(href);
  if (!match) return null;
  const [, contentType = "", base64, payload = ""] = match;
  try {
    const bytes = base64
      ? Uint8Array.from(Buffer.from(payload, "base64"))
      : new TextEncoder().encode(decodeURIComponent(payload));
    return bytes.length > 0 && bytes.length <= MAX_FAVICON_BYTES
      ? { contentType: contentType.toLowerCase(), bytes }
      : null;
  } catch {
    return null;
  }
}

/** Resolves an href against the entry file; only paths inside the deployment survive. */
function manifestPathOf(href: string, entry: string): string | null {
  if (SCHEME.test(href)) return null;
  try {
    const url = new URL(href, `http://deployment.invalid/${entry}`);
    return normalizeManifestPath(decodeURIComponent(url.pathname.slice(1)));
  } catch {
    return null;
  }
}

async function readFromDeployment(
  deps: DomainDeps,
  deploymentId: string,
  path: string,
): Promise<Favicon | null> {
  const file = deps.deployments.findFile(deploymentId, path);
  if (!file || !file.contentType.startsWith("image/") || file.size > MAX_FAVICON_BYTES) return null;
  const blob = await deps.blobs.open(file.hash);
  return blob
    ? { contentType: file.contentType, bytes: new Uint8Array(await blob.arrayBuffer()) }
    : null;
}

/**
 * Icon of the current deployment: `<link rel="icon">` of the entry page, then `favicon.*`.
 * Reads only the deployment's own files or `data:image/*` URIs (≤ 256 KB); never fetches remotely.
 */
export async function findFavicon(deps: DomainDeps, preview: Preview): Promise<Favicon | null> {
  const deployment = preview.currentDeploymentId
    ? deps.deployments.findSummary(preview.currentDeploymentId)
    : null;
  if (!deployment) return null;
  const entryFile = deps.deployments.findFile(deployment.id, deployment.entry);
  if (entryFile?.contentType.startsWith("text/html") && entryFile.size <= MAX_ENTRY_HTML_BYTES) {
    const blob = await deps.blobs.open(entryFile.hash);
    const html = blob ? await blob.text() : "";
    for (const href of iconHrefs(html)) {
      const inline = fromDataUri(href);
      if (inline) return inline;
      const path = manifestPathOf(href, deployment.entry);
      const icon = path ? await readFromDeployment(deps, deployment.id, path) : null;
      if (icon) return icon;
    }
  }
  for (const name of FALLBACK_NAMES) {
    const icon = await readFromDeployment(deps, deployment.id, name);
    if (icon) return icon;
  }
  return null;
}
