// SPDX-License-Identifier: MIT

import { type ZodObject, type ZodRawShape, type ZodTypeAny, z } from "zod";
import {
  BlobParam,
  BlobResponse,
  DeployQuery,
  DeploymentParam,
  FileListing,
  FilesQuery,
  ListPreviewsQuery,
  NameParam,
  PlanDeploymentRequest,
  PlanDeploymentResponse,
  PreviewDetail,
  PreviewList,
  PreviewView,
  RollbackRequest,
  UpdatePreviewRequest,
} from "./api";
import { CreateKeyRequest, CreatedKey, KeyList, KeyParam, type Scope } from "./api-keys";
import { DeployResponse } from "./deploy-response";
import { Health } from "./health";
import { CreateLinkRequest, CreatedLink, LinkList, LinkParam } from "./links";
import { Usage } from "./usage";

export type HttpMethod = "get" | "put" | "post" | "patch" | "delete";

export interface Operation {
  id: string;
  method: HttpMethod;
  /** OpenAPI-style path, e.g. /v1/previews/{name}. */
  path: string;
  summary: string;
  /** null = public. `admin` always satisfies any scope. */
  scope: Scope | null;
  params?: ZodObject<ZodRawShape>;
  query?: ZodObject<ZodRawShape>;
  json?: ZodTypeAny;
  /** Raw body content types (one-shot deploy, blob upload) with a description each. */
  raw?: Record<string, string>;
  responses: { status: number; description: string; schema?: ZodTypeAny }[];
}

const FileParam = NameParam.extend({ path: z.string().min(1) });

export const OPERATIONS: readonly Operation[] = [
  {
    id: "health",
    method: "get",
    path: "/healthz",
    summary: "Liveness probe",
    scope: null,
    responses: [{ status: 200, description: "Server is up", schema: Health }],
  },
  {
    id: "listPreviews",
    method: "get",
    path: "/v1/previews",
    summary: "List previews",
    scope: "read",
    query: ListPreviewsQuery,
    responses: [{ status: 200, description: "A page of previews", schema: PreviewList }],
  },
  {
    id: "getPreview",
    method: "get",
    path: "/v1/previews/{name}",
    summary: "Preview detail with its deployments",
    scope: "read",
    params: NameParam,
    responses: [{ status: 200, description: "The preview", schema: PreviewDetail }],
  },
  {
    id: "deployPreview",
    method: "put",
    path: "/v1/previews/{name}",
    summary: "One-shot deploy: send an HTML page, zip, tar.gz or multipart files",
    scope: "deploy",
    params: NameParam,
    query: DeployQuery,
    raw: {
      "text/html": "A single page, stored as index.html",
      "application/zip": "A folder as zip; a single top-level folder is stripped",
      "application/gzip": "A folder as tar.gz; a single top-level folder is stripped",
      "multipart/form-data": "One part per file, the file name is the path",
    },
    responses: [
      { status: 201, description: "Preview created", schema: DeployResponse },
      { status: 200, description: "Preview updated", schema: DeployResponse },
    ],
  },
  {
    id: "updatePreview",
    method: "patch",
    path: "/v1/previews/{name}",
    summary: "Change visibility, ttl, pinned or rename",
    scope: "deploy",
    params: NameParam,
    json: UpdatePreviewRequest,
    responses: [{ status: 200, description: "The updated preview", schema: PreviewView }],
  },
  {
    id: "deletePreview",
    method: "delete",
    path: "/v1/previews/{name}",
    summary: "Delete a preview and its deployments",
    scope: "deploy",
    params: NameParam,
    responses: [{ status: 204, description: "Deleted" }],
  },
  {
    id: "rollbackPreview",
    method: "post",
    path: "/v1/previews/{name}/rollback",
    summary: "Point the preview at an earlier deployment",
    scope: "deploy",
    params: NameParam,
    json: RollbackRequest,
    responses: [{ status: 200, description: "The preview after rollback", schema: PreviewView }],
  },
  {
    id: "planDeployment",
    method: "post",
    path: "/v1/previews/{name}/deployments",
    summary: "Manifest step: declare files by sha256 and get the blobs still missing",
    scope: "deploy",
    params: NameParam,
    json: PlanDeploymentRequest,
    responses: [
      { status: 201, description: "Plan with missing blob hashes", schema: PlanDeploymentResponse },
    ],
  },
  {
    id: "finalizeDeployment",
    method: "post",
    path: "/v1/previews/{name}/deployments/{id}/finalize",
    summary: "Verify blobs and promote the deployment atomically",
    scope: "deploy",
    params: DeploymentParam,
    responses: [
      { status: 201, description: "Preview created", schema: DeployResponse },
      { status: 200, description: "Preview updated", schema: DeployResponse },
    ],
  },
  {
    id: "listFiles",
    method: "get",
    path: "/v1/previews/{name}/files",
    summary: "Manifest of a deployment",
    scope: "read",
    params: NameParam,
    query: FilesQuery,
    responses: [{ status: 200, description: "Files of the deployment", schema: FileListing }],
  },
  {
    id: "readFile",
    method: "get",
    path: "/v1/previews/{name}/files/{path}",
    summary: "Read one file (served as text/plain or octet-stream)",
    scope: "read",
    params: FileParam,
    query: FilesQuery,
    responses: [{ status: 200, description: "File bytes" }],
  },
  {
    id: "listLinks",
    method: "get",
    path: "/v1/previews/{name}/links",
    summary: "Share links of a private preview (no secrets)",
    scope: "read",
    params: NameParam,
    responses: [{ status: 200, description: "The links", schema: LinkList }],
  },
  {
    id: "createLink",
    method: "post",
    path: "/v1/previews/{name}/links",
    summary: "Create a share link for a private preview (URL shown once)",
    scope: "deploy",
    params: NameParam,
    json: CreateLinkRequest,
    responses: [{ status: 201, description: "The link with its secret URL", schema: CreatedLink }],
  },
  {
    id: "revokeLink",
    method: "delete",
    path: "/v1/previews/{name}/links/{id}",
    summary: "Revoke a share link; it stops working immediately",
    scope: "deploy",
    params: LinkParam,
    responses: [{ status: 204, description: "Revoked" }],
  },
  {
    id: "putBlob",
    method: "put",
    path: "/v1/blobs/{sha256}",
    summary: "Upload a blob by content hash",
    scope: "deploy",
    params: BlobParam,
    raw: { "application/octet-stream": "The exact bytes whose SHA-256 is in the path" },
    responses: [{ status: 200, description: "Stored", schema: BlobResponse }],
  },
  {
    id: "createKey",
    method: "post",
    path: "/v1/keys",
    summary: "Create an API key (token shown once)",
    scope: "admin",
    json: CreateKeyRequest,
    responses: [{ status: 201, description: "The key with its secret", schema: CreatedKey }],
  },
  {
    id: "listKeys",
    method: "get",
    path: "/v1/keys",
    summary: "List API keys (no secrets)",
    scope: "admin",
    responses: [{ status: 200, description: "All keys", schema: KeyList }],
  },
  {
    id: "revokeKey",
    method: "delete",
    path: "/v1/keys/{id}",
    summary: "Revoke an API key",
    scope: "admin",
    params: KeyParam,
    responses: [{ status: 204, description: "Revoked" }],
  },
  {
    id: "getUsage",
    method: "get",
    path: "/v1/usage",
    summary: "Totals, per-key usage and quota headroom",
    scope: "admin",
    responses: [{ status: 200, description: "Usage", schema: Usage }],
  },
];

/** Hono route pattern for an OpenAPI path. */
export function routePattern(path: string): string {
  return path.replace("{path}", "*").replace(/\{(\w+)\}/g, ":$1");
}
