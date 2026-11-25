// SPDX-License-Identifier: MIT

import type { Visibility } from "@html-preview/shared";
import type { DomainDeps } from "../core/ports/deps";
import { type FinalizeResult, finalizeDeployment, planDeployment } from "./deploy";
import { sha256Hex } from "./hash";

export interface DeployFile {
  path: string;
  content: Uint8Array;
}

export interface DeployFilesInput {
  name: string;
  files: DeployFile[];
  entry?: string;
  message?: string;
  visibility?: Visibility;
  ttlHours?: number;
  spa?: boolean;
  createdBy: string;
}

export async function deployFiles(
  deps: DomainDeps,
  input: DeployFilesInput,
): Promise<FinalizeResult> {
  const manifest: Record<string, { hash: string; size: number }> = {};
  const contentByHash = new Map<string, Uint8Array>();
  for (const file of input.files) {
    const hash = sha256Hex(file.content);
    manifest[file.path] = { hash, size: file.content.length };
    contentByHash.set(hash, file.content);
  }
  const { files: _files, ...rest } = input;
  const plan = await planDeployment(deps, { ...rest, files: manifest });
  for (const hash of plan.missing) {
    const content = contentByHash.get(hash);
    if (content) await deps.blobs.put(content, hash);
  }
  return finalizeDeployment(deps, { name: input.name, deploymentId: plan.deploymentId });
}
