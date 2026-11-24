// SPDX-License-Identifier: MIT

import type { Manifest, ManifestInput } from "@html-preview/shared";
import { BadRequest } from "../core/infra/errors";

const MAX_PATH_LENGTH = 1024;

function invalid(raw: string, reason: string): BadRequest {
  return new BadRequest(
    `Invalid file path ${JSON.stringify(raw)}: ${reason}`,
    "Use relative paths with forward slashes, without '..' or hidden segments",
    "INVALID_PATH",
  );
}

export function normalizeManifestPath(raw: string): string {
  if (raw.length > MAX_PATH_LENGTH) throw invalid(raw, "path is too long");
  if (raw.includes("\0")) throw invalid(raw, "contains a NUL byte");
  if (raw.includes("\\")) throw invalid(raw, "contains a backslash");
  if (raw.startsWith("/")) throw invalid(raw, "must not be absolute");
  const segments = raw.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.length === 0) throw invalid(raw, "path is empty");
  for (const segment of segments) {
    if (segment === "..") throw invalid(raw, "must not contain '..'");
    if (segment.startsWith(".")) throw invalid(raw, `hidden segment "${segment}" is not allowed`);
  }
  return segments.join("/");
}

export function normalizeManifest(input: ManifestInput): Manifest {
  const manifest: Manifest = {};
  for (const [raw, file] of Object.entries(input)) {
    const path = normalizeManifestPath(raw);
    if (manifest[path]) throw invalid(raw, "duplicates another entry after normalization");
    manifest[path] = { ...file, contentType: Bun.file(path).type };
  }
  return manifest;
}

export function resolveEntry(manifest: Manifest, entry: string | undefined): string {
  const resolved = normalizeManifestPath(entry ?? "index.html");
  if (!manifest[resolved]) {
    throw new BadRequest(
      `Entry file "${resolved}" is not part of the manifest`,
      "Include the entry file in the manifest or pass a different 'entry'",
      "ENTRY_MISSING",
    );
  }
  return resolved;
}
