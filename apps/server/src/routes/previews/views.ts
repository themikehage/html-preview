// SPDX-License-Identifier: MIT

import type {
  DeployResponse,
  DeploymentSummary,
  DeploymentView,
  LinkView,
  Preview,
  PreviewView,
} from "@html-preview/shared";
import type { Config } from "../../core/infra/config";
import { deploymentUrl, previewUrl } from "../../core/infra/urls";
import type { StoredLink } from "../../core/ports/link-repo.port";
import type { FinalizeResult } from "../../domain/deploy";

export function toPreviewView(
  config: Config,
  preview: Preview,
  deployment: DeploymentSummary | null,
): PreviewView {
  return { ...preview, url: previewUrl(config, preview.id), deployment };
}

export function toDeploymentView(
  config: Config,
  preview: Preview,
  deployment: DeploymentSummary,
): DeploymentView {
  return {
    ...deployment,
    url: deploymentUrl(config, preview.id, deployment.id),
    current: preview.currentDeploymentId === deployment.id,
  };
}

export function toDeployResponse(config: Config, result: FinalizeResult): DeployResponse {
  const { preview, deployment, created, warnings } = result;
  return {
    url: previewUrl(config, preview.id),
    deploymentUrl: deploymentUrl(config, preview.id, deployment.id),
    name: preview.name,
    deploymentId: deployment.id,
    created,
    files: deployment.fileCount,
    bytes: deployment.bytes,
    uploaded: deployment.uploaded,
    expiresAt: preview.expiresAt,
    warnings,
  };
}

export function toLinkView(link: StoredLink): LinkView {
  const { previewId: _previewId, tokenHash: _tokenHash, ...view } = link;
  return view;
}
