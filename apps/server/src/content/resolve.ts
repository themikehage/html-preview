// SPDX-License-Identifier: MIT

import type { DeploymentSummary, ManifestFile, Preview } from "@html-preview/shared";
import { AppError } from "../core/infra/errors";
import { type HostTarget, targetFromHost } from "../core/infra/labels";
import type { DomainDeps } from "../core/ports/deps";
import { verifyClaims } from "../domain/capability";
import { isLinkActive } from "../domain/links";
import { normalizeManifestPath } from "../domain/manifest-path";
import { effectiveVisibility } from "../domain/visibility";

export type Resolution =
  | { kind: "redirect"; location: string }
  | {
      /**
       * A share token or owner ticket to exchange for a capability: carried in the path in
       * path mode, or in an `HttpOnly` host-only cookie in subdomain mode (`viaCookie`).
       */
      kind: "redeem";
      preview: Preview;
      token: string;
      viaCookie: boolean;
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

function spaFallback(
  deps: DomainDeps,
  deployment: DeploymentSummary,
  enabled: boolean,
  path: string,
): { file: ManifestFile } | null {
  if (!enabled || path.split("/").at(-1)?.includes(".")) return null;
  const file = deps.deployments.findFile(deployment.id, deployment.entry);
  return file ? { file } : null;
}

function lookup(
  deps: DomainDeps,
  deployment: DeploymentSummary,
  rest: string[],
  trailingSlash: boolean,
  spa: boolean,
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
  if (trailingSlash) return index ? { file: index } : spaFallback(deps, deployment, spa, path);
  const file = deps.deployments.findFile(deployment.id, path);
  if (file) return { file };
  return index ? { redirect: true } : spaFallback(deps, deployment, spa, path);
}

export interface ContentRequest {
  url: URL;
  /** Lowercase `Host` header; picks the preview in subdomain mode. */
  host: string;
  /** Value of the `hp_cap` cookie (subdomain mode, private previews). */
  capabilityCookie: string | null;
}

export const CAPABILITY_COOKIE = "hp_cap";

interface Located {
  keys: string[];
  fixedId: string | null;
  rest: string[];
  /** Path-mode segment (`<id>[@dep]`), re-used for redirects and URL rewriting. */
  segment: string | null;
}

function locate(deps: DomainDeps, request: ContentRequest, parts: string[]): Located | null {
  const decoded = decodeSegments(parts);
  if (!decoded) return null;
  if (deps.contentMode === "subdomain") {
    const contentHost = new URL(deps.contentOrigin).host.toLowerCase();
    const target: HostTarget | null = targetFromHost(request.host, contentHost);
    if (!target) return null;
    return { keys: target.keys, fixedId: target.deploymentId, rest: decoded, segment: null };
  }
  const [segment, ...segments] = decoded;
  if (!segment) return null;
  const at = segment.indexOf("@");
  return {
    keys: [at === -1 ? segment : segment.slice(0, at)],
    fixedId: at === -1 ? null : segment.slice(at + 1),
    rest: segments,
    segment,
  };
}

export function resolveContent(
  deps: DomainDeps,
  request: ContentRequest,
  now: Date,
): Resolution | null {
  const { url } = request;
  const trailingSlash = url.pathname.endsWith("/");
  const parts = url.pathname.split("/").filter((part) => part !== "");
  const found = locate(deps, request, parts);
  if (!found) return null;
  const subdomain = deps.contentMode === "subdomain";
  const { fixedId } = found;
  let rest = found.rest;

  const preview = found.keys.map((key) => findPreview(deps, key)).find((item) => item !== null);
  if (!preview || !isLive(preview, now)) return null;
  if (fixedId !== null && preview.id !== found.keys[0]) return null;

  const restricted = visibilityOf(deps, preview) === "private";
  const segmentPrefix = subdomain
    ? ""
    : `/${encodeURIComponent(found.segment ?? "").replace(/%40/g, "@")}`;
  let prefix = segmentPrefix;
  if (restricted) {
    // Private previews need a capability. Path mode: `~<token>` right after the id, either a
    // capability or something to exchange for one. Subdomain mode: `~<token>` is always an
    // exchange (it ends in a cookie and a clean URL); afterwards the cookie is the proof.
    const marker = rest[0];
    const token = marker?.startsWith("~") ? marker.slice(1) : null;
    if (token !== null) rest = rest.slice(1);
    const exchange = (): Resolution => {
      const tail = rest.map((part) => encodeURIComponent(part)).join("/");
      const suffix = `${tail}${trailingSlash && tail ? "/" : ""}${url.search}`;
      return {
        kind: "redeem",
        preview,
        token: token ?? "",
        viaCookie: subdomain,
        location: (capability) =>
          subdomain ? `/${suffix}` : `${segmentPrefix}/~${capability}/${suffix}`,
      };
    };
    if (subdomain) {
      if (token !== null) return exchange();
      const cookie = request.capabilityCookie;
      if (!cookie || !capabilityHolds(deps, preview, cookie, now)) return null;
    } else {
      if (token === null) return null;
      if (!capabilityHolds(deps, preview, token, now)) return exchange();
      prefix = `${segmentPrefix}/~${token}`;
    }
  }

  const deploymentId = fixedId ?? preview.currentDeploymentId;
  const deployment = deploymentId ? deps.deployments.findSummary(deploymentId) : null;
  if (!deployment || deployment.previewId !== preview.id || deployment.status !== "ready") {
    return null;
  }

  if (rest.length === 0 && !trailingSlash) {
    return { kind: "redirect", location: `${prefix}/${url.search}` };
  }
  const hit = lookup(deps, deployment, rest, trailingSlash, preview.spa);
  if (!hit) return null;
  if ("redirect" in hit) {
    return { kind: "redirect", location: `${url.pathname}/${url.search}` };
  }
  return {
    kind: "file",
    preview,
    deployment,
    file: hit.file,
    prefix,
    fixed: fixedId !== null,
    restricted,
  };
}
