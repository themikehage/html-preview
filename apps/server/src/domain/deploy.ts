// SPDX-License-Identifier: MIT

import {
  type DeployWarning,
  type Deployment,
  ManifestInput,
  type Preview,
  PreviewName,
  type Visibility,
} from "@html-preview/shared";
import { BadRequest, Conflict, NotFound } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";
import { normalizeManifest, resolveEntry } from "./manifest-path";
import { assertManifestWithinQuotas } from "./quotas";
import { assertVisibilityAllowed, defaultVisibility, expiryFrom } from "./visibility";
import { analyzeDeployment } from "./warnings";

const MAX_MESSAGE_LENGTH = 500;
const MAX_REPORTED_BLOBS = 20;

export interface PlanInput {
  name: string;
  files: unknown;
  entry?: string;
  message?: string;
  visibility?: Visibility;
  ttlHours?: number;
  createdBy: string;
}

export interface DeploymentPlan {
  previewId: string;
  deploymentId: string;
  missing: string[];
}

export interface FinalizeResult {
  preview: Preview;
  deployment: Deployment;
  created: boolean;
  warnings: DeployWarning[];
}

function parseName(name: string): string {
  const parsed = PreviewName.safeParse(name);
  if (parsed.success) return parsed.data;
  throw new BadRequest(
    `Invalid preview name ${JSON.stringify(name)}: ${parsed.error.issues[0]?.message}`,
    "Use lowercase letters, digits and hyphens, starting with a letter or digit (max 63)",
    "INVALID_NAME",
  );
}

function parseFiles(files: unknown): ManifestInput {
  const parsed = ManifestInput.safeParse(files);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new BadRequest(
    `Invalid manifest: ${issue?.path.join(".") || "files"} ${issue?.message ?? ""}`.trim(),
    "Send { path: { hash: <sha256 hex>, size: <bytes> } } with at least one file",
    "INVALID_MANIFEST",
  );
}

function checkMessage(message: string | undefined): string | null {
  if (message === undefined) return null;
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequest(
      `Message is longer than ${MAX_MESSAGE_LENGTH} characters`,
      "Shorten the deployment message",
      "INVALID_MESSAGE",
    );
  }
  return message;
}

function uniqueHashes(files: Record<string, { hash: string }>): string[] {
  return [...new Set(Object.values(files).map((file) => file.hash))];
}

async function missingBlobs(deps: DomainDeps, hashes: string[]): Promise<string[]> {
  const present = await Promise.all(hashes.map((hash) => deps.blobs.has(hash)));
  return hashes.filter((_, index) => !present[index]);
}

export async function planDeployment(deps: DomainDeps, input: PlanInput): Promise<DeploymentPlan> {
  const name = parseName(input.name);
  const manifest = normalizeManifest(parseFiles(input.files));
  const entry = resolveEntry(manifest, input.entry);
  const message = checkMessage(input.message);
  if (input.createdBy.trim() === "") {
    throw new BadRequest("createdBy is required", "Identify the caller", "INVALID_ACTOR");
  }
  if (input.visibility) assertVisibilityAllowed(input.visibility, deps.maxVisibility);
  const missing = await missingBlobs(deps, uniqueHashes(manifest));
  assertManifestWithinQuotas(deps, manifest, missing);
  const now = deps.clock.now();
  const createdAt = now.toISOString();
  const deploymentId = deps.ids.deploymentId();

  const previewId = deps.tx.run(() => {
    const existing = deps.previews.findByName(name);
    const id = existing?.id ?? deps.ids.previewId();
    if (!existing) {
      deps.previews.create({
        id,
        name,
        visibility: input.visibility ?? defaultVisibility(deps.maxVisibility),
        expiresAt: expiryFrom(now, input.ttlHours ?? deps.defaultTtlHours),
        pinned: false,
        currentDeploymentId: null,
        createdBy: input.createdBy,
        createdAt,
        updatedAt: createdAt,
      });
    }
    if (existing && (input.visibility !== undefined || input.ttlHours !== undefined)) {
      deps.previews.update(
        id,
        {
          ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
          ...(input.ttlHours !== undefined ? { expiresAt: expiryFrom(now, input.ttlHours) } : {}),
        },
        createdAt,
      );
    }
    deps.deployments.create({
      id: deploymentId,
      previewId: id,
      entry,
      message,
      bytes: Object.values(manifest).reduce((total, file) => total + file.size, 0),
      fileCount: Object.keys(manifest).length,
      uploaded: missing.length,
      status: "pending",
      createdBy: input.createdBy,
      createdAt,
      files: manifest,
    });
    return id;
  });
  return { previewId, deploymentId, missing };
}

export async function finalizeDeployment(
  deps: DomainDeps,
  input: { name: string; deploymentId: string },
): Promise<FinalizeResult> {
  const preview = deps.previews.findByName(parseName(input.name));
  if (!preview)
    throw new NotFound(`Preview "${input.name}" not found`, undefined, "PREVIEW_NOT_FOUND");
  const deployment = deps.deployments.find(input.deploymentId);
  if (!deployment || deployment.previewId !== preview.id) {
    throw new NotFound(
      `Deployment "${input.deploymentId}" not found for preview "${preview.name}"`,
      "Create a deployment with the manifest step first",
      "DEPLOYMENT_NOT_FOUND",
    );
  }
  if (deployment.status === "ready") {
    throw new Conflict(
      "Deployment is already finalized",
      "Create a new deployment to publish again",
      "DEPLOYMENT_ALREADY_FINAL",
    );
  }
  const missing = await missingBlobs(deps, uniqueHashes(deployment.files));
  if (missing.length > 0) {
    const shown = missing.slice(0, MAX_REPORTED_BLOBS).join(", ");
    const rest =
      missing.length > MAX_REPORTED_BLOBS ? ` and ${missing.length - MAX_REPORTED_BLOBS} more` : "";
    throw new Conflict(
      `Blobs missing: ${shown}${rest}`,
      "Upload each missing blob with PUT /v1/blobs/:sha256, then finalize again",
      "BLOBS_MISSING",
    );
  }
  const updatedAt = deps.clock.now().toISOString();
  deps.tx.run(() => {
    deps.deployments.markReady(deployment.id);
    deps.previews.setCurrentDeployment(preview.id, deployment.id, updatedAt);
  });
  const ready: Deployment = { ...deployment, status: "ready" };
  return {
    preview: { ...preview, currentDeploymentId: deployment.id, updatedAt },
    deployment: ready,
    created: preview.currentDeploymentId === null,
    warnings: await analyzeDeployment(deps, ready),
  };
}
