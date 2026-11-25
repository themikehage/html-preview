// SPDX-License-Identifier: MIT

import type { DeployResponse, PreviewView } from "@html-preview/shared";
import type { Runtime } from "./runtime";

export function printJson(rt: Runtime, value: unknown): void {
  rt.out(`${JSON.stringify(value)}\n`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function deployLines(result: DeployResponse): string[] {
  const expiry = result.expiresAt ? `expires ${result.expiresAt}` : "no expiry";
  const lines = [
    `${result.created ? "Created" : "Updated"} ${result.name}: ${result.url}`,
    `  ${result.files} files, ${formatBytes(result.bytes)}, ${result.uploaded} uploaded, ${expiry}`,
  ];
  for (const warning of result.warnings) {
    const where = warning.file ? ` (${warning.file})` : "";
    lines.push(`  warning ${warning.code}${where}: ${warning.fix}`);
  }
  return lines;
}

export function previewLine(view: PreviewView): string {
  const flags = [view.visibility, view.pinned ? "pinned" : null, view.spa ? "spa" : null]
    .filter(Boolean)
    .join(", ");
  const expiry = view.expiresAt ? `expires ${view.expiresAt}` : "no expiry";
  return `${view.name}  ${view.url}  (${flags}; ${expiry})`;
}
