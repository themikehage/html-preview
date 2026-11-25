// SPDX-License-Identifier: MIT

import type { DeploymentSummary, ManifestFile, Preview } from "@html-preview/shared";
import { AppError } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";
import { verifyClaims } from "../domain/capability";
import { isLinkActive } from "../domain/links";
import { normalizeManifestPath } from "../domain/manifest-path";
import { effectiveVisibility } from "../domain/visibility";

export type Resolution =
  | { kind: "redirect"; location: string }
  | {
      /** A share token or owner ticket that must be exchanged for a capability in the path. */
      kind: "redeem";
      preview: Preview;
      token: string;
      location(capability: string): string;
    }
  | {
      kind: "file";
      preview: Preview;
      deployment: DeploymentSummary;
      file: ManifestFile;
      prefix: string;
      fixed: boolean;
      restricted: boolean;
    };

function isLive(preview: Preview, now: Date): boolean {
  if (preview.pinned || !preview.expiresAt) return true;
  return Date.parse(preview.expiresAt) > now.getTime();
}

function visibilityOf(deps: DomainDeps, preview: Preview): Preview["visibility"] {
  return effectiveVisibility(preview.visibility, deps.maxVisibility);
}

function findPreview(deps: DomainDeps, segment: string): Preview | null {
  const byId = deps.previews.findById(segment);
  if (byId) return byId;
  const byName = deps.previews.findByName(segment);
  return byName && visibilityOf(deps, byName) === "public" ? byName : null;
}

/** A capability is valid for this preview and, if it came from a share link, that link is live. */
function capabilityHolds(deps: DomainDeps, preview: Preview, token: string, now: Date): boolean {
  const claims = verifyClaims(deps.signingSecret, token, "cap", now);
  if (!claims || claims.p !== preview.id) return false;
  if (!claims.l) return true;
  const link = deps.links.findById(claims.l);
  return link !== null && link.previewId === preview.id && isLinkActive(link, now);
}

function decodeSegments(parts: string[]): string[] | null {
  try {
    return parts.map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}

function lookup(
  deps: DomainDeps,
  deployment: DeploymentSummary,
  rest: string[],
  trailingSlash: boolean,
): { file: ManifestFile } | { redirect: true } | null {
  if (rest.length === 0) {
    const file = deps.deployments.findFile(deployment.id, deployment.entry);
    return file ? { file } : null;
  }
  let path: string;
  try {
    path = normalizeManifestPath(rest.join("/"));
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
  const index = deps.deployments.findFile(deployment.id, `${path}/index.html`);
  if (trailingSlash) return index ? { file: index } : null;
  const file = deps.deployments.findFile(deployment.id, path);
  if (file) return { file };
  return index ? { redirect: true } : null;
}

export function resolveContent(deps: DomainDeps, url: URL, now: Date): Resolution | null {
  const trailingSlash = url.pathname.endsWith("/");
  const parts = url.pathname.split("/").filter((part) => part !== "");
  const decoded = decodeSegments(parts);
  const [segment, ...segments] = decoded ?? [];
  if (!segment) return null;
  let rest = segments;

  const at = segment.indexOf("@");
  const key = at === -1 ? segment : segment.slice(0, at);
  const fixedId = at === -1 ? null : segment.slice(at + 1);
  const preview = findPreview(deps, key);
  if (!preview || !isLive(preview, now) || (fixedId !== null && preview.id !== key)) return null;

  const restricted = visibilityOf(deps, preview) === "private";
  const segmentPrefix = `/${encodeURIComponent(segment).replace(/%40/g, "@")}`;
  let prefix = segmentPrefix;
  if (restricted) {
    // Private previews need `~<token>` right after the id; anything else is a plain 404.
    const marker = rest[0];
    if (!marker?.startsWith("~")) return null;
    const token = marker.slice(1);
    rest = rest.slice(1);
    if (!capabilityHolds(deps, preview, token, now)) {
      const tail = rest.map((part) => encodeURIComponent(part)).join("/");
      const suffix = `${tail}${trailingSlash && tail ? "/" : ""}${url.search}`;
      return {
        kind: "redeem",
        preview,
        token,
        location: (capability) => `${segmentPrefix}/~${capability}/${suffix}`,
      };
    }
    prefix = `${segmentPrefix}/~${token}`;
  }

  const deploymentId = fixedId ?? preview.currentDeploymentId;
  const deployment = deploymentId ? deps.deployments.findSummary(deploymentId) : null;
  if (!deployment || deployment.previewId !== preview.id || deployment.status !== "ready") {
    return null;
  }

  if (rest.length === 0 && !trailingSlash) {
    return { kind: "redirect", location: `${prefix}/${url.search}` };
  }
  const found = lookup(deps, deployment, rest, trailingSlash);
  if (!found) return null;
  if ("redirect" in found) {
    return { kind: "redirect", location: `${url.pathname}/${url.search}` };
  }
  return {
    kind: "file",
    preview,
    deployment,
    file: found.file,
    prefix,
    fixed: fixedId !== null,
    restricted,
  };
}
