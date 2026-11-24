// SPDX-License-Identifier: MIT

import type { DeploymentSummary, ManifestFile, Preview } from "@html-preview/shared";
import { AppError } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";
import { normalizeManifestPath } from "../domain/manifest-path";

export type Resolution =
  | { kind: "redirect"; location: string }
  | {
      kind: "file";
      preview: Preview;
      deployment: DeploymentSummary;
      file: ManifestFile;
      prefix: string;
      fixed: boolean;
    };

function isLive(preview: Preview, now: Date): boolean {
  if (preview.pinned || !preview.expiresAt) return true;
  return Date.parse(preview.expiresAt) > now.getTime();
}

function findPreview(deps: DomainDeps, segment: string): Preview | null {
  const byId = deps.previews.findById(segment);
  if (byId) return byId.visibility === "private" ? null : byId;
  const byName = deps.previews.findByName(segment);
  return byName?.visibility === "public" ? byName : null;
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
  const [segment, ...rest] = decoded ?? [];
  if (!segment) return null;

  const at = segment.indexOf("@");
  const key = at === -1 ? segment : segment.slice(0, at);
  const fixedId = at === -1 ? null : segment.slice(at + 1);
  const preview = findPreview(deps, key);
  if (!preview || !isLive(preview, now) || (fixedId !== null && preview.id !== key)) return null;

  const deploymentId = fixedId ?? preview.currentDeploymentId;
  const deployment = deploymentId ? deps.deployments.findSummary(deploymentId) : null;
  if (!deployment || deployment.previewId !== preview.id || deployment.status !== "ready") {
    return null;
  }

  const prefix = `/${encodeURIComponent(segment).replace(/%40/g, "@")}`;
  if (rest.length === 0 && !trailingSlash) {
    return { kind: "redirect", location: `${prefix}/${url.search}` };
  }
  const found = lookup(deps, deployment, rest, trailingSlash);
  if (!found) return null;
  if ("redirect" in found) {
    return { kind: "redirect", location: `${url.pathname}/${url.search}` };
  }
  return { kind: "file", preview, deployment, file: found.file, prefix, fixed: fixedId !== null };
}
