// SPDX-License-Identifier: MIT

import type { DeploymentSummary, Manifest, ManifestFile } from "@html-preview/shared";
import { Conflict, NotFound } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";
import { normalizeManifestPath } from "./manifest-path";
import { requirePreview } from "./preview-admin";

function resolveDeployment(
  deps: DomainDeps,
  previewId: string,
  current: string | null,
  requested: string | undefined,
): DeploymentSummary {
  const id = requested ?? current;
  if (!id) throw new Conflict("Preview has no deployment yet", "Deploy first", "NO_DEPLOYMENT");
  const deployment = deps.deployments.findSummary(id);
  if (!deployment || deployment.previewId !== previewId || deployment.status !== "ready") {
    throw new NotFound(
      `Deployment "${id}" not found`,
      "Use a deploymentId from the preview's deployments",
      "DEPLOYMENT_NOT_FOUND",
    );
  }
  return deployment;
}

export function listFiles(
  deps: DomainDeps,
  input: { name: string; deploymentId?: string },
): { deployment: DeploymentSummary; files: Manifest } {
  const preview = requirePreview(deps, input.name);
  const deployment = resolveDeployment(
    deps,
    preview.id,
    preview.currentDeploymentId,
    input.deploymentId,
  );
  return { deployment, files: deps.deployments.find(deployment.id)?.files ?? {} };
}

export async function readFile(
  deps: DomainDeps,
  input: { name: string; deploymentId?: string; path: string },
): Promise<{ file: ManifestFile; blob: Blob }> {
  const preview = requirePreview(deps, input.name);
  const deployment = resolveDeployment(
    deps,
    preview.id,
    preview.currentDeploymentId,
    input.deploymentId,
  );
  const path = normalizeManifestPath(input.path);
  const file = deps.deployments.findFile(deployment.id, path);
  const blob = file ? await deps.blobs.open(file.hash) : null;
  if (!file || !blob) {
    throw new NotFound(
      `File "${path}" not found`,
      "List the files of the deployment",
      "FILE_NOT_FOUND",
    );
  }
  return { file, blob };
}
