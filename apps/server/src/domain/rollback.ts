// SPDX-License-Identifier: MIT

import type { DeploymentSummary, Preview } from "@html-preview/shared";
import { Conflict, NotFound } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";
import { requirePreview } from "./preview-admin";

export interface RollbackInput {
  name: string;
  deploymentId?: string;
}

export interface RollbackResult {
  preview: Preview;
  deployment: DeploymentSummary;
}

export function rollback(deps: DomainDeps, input: RollbackInput): RollbackResult {
  const preview = requirePreview(deps, input.name);
  if (!preview.currentDeploymentId) {
    throw new Conflict("Preview has no deployment yet", "Deploy first", "NO_DEPLOYMENT");
  }
  const ready = deps.deployments.listReady(preview.id);
  let target: DeploymentSummary | undefined;
  if (input.deploymentId) {
    target = ready.find((deployment) => deployment.id === input.deploymentId);
    if (!target) {
      throw new NotFound(
        `Deployment "${input.deploymentId}" is not a finalized deployment of "${preview.name}"`,
        "List the preview's deployments and pick one of them",
        "DEPLOYMENT_NOT_FOUND",
      );
    }
  } else {
    const index = ready.findIndex((deployment) => deployment.id === preview.currentDeploymentId);
    target = ready[index + 1];
    if (index === -1 || !target) {
      throw new Conflict(
        "There is no previous deployment to roll back to",
        "Pass an explicit deploymentId or deploy again",
        "NO_PREVIOUS_DEPLOYMENT",
      );
    }
  }
  if (target.id === preview.currentDeploymentId) {
    throw new Conflict(
      "That deployment is already the current one",
      "Pick a different deploymentId",
      "ALREADY_CURRENT",
    );
  }
  const updatedAt = deps.clock.now().toISOString();
  deps.previews.setCurrentDeployment(preview.id, target.id, updatedAt);
  return { preview: { ...preview, currentDeploymentId: target.id, updatedAt }, deployment: target };
}
