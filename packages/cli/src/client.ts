// SPDX-License-Identifier: MIT

import type {
  CreateLinkRequest,
  CreatedLink,
  DeployResponse,
  FileListing,
  LinkList,
  PlanDeploymentRequest,
  PlanDeploymentResponse,
  PreviewDetail,
  PreviewList,
  PreviewView,
  UpdatePreviewRequest,
} from "@html-preview/shared";
import { ApiError, type ErrorPayload, NetworkError } from "./errors";
import type { FetchLike } from "./runtime";

const MAX_RATE_LIMIT_RETRIES = 4;
const MAX_RETRY_WAIT_MS = 15_000;

export interface ClientOptions {
  baseUrl: string;
  key: string;
  fetch: FetchLike;
  sleep(ms: number): Promise<void>;
  userAgent: string;
}

interface RequestInput {
  json?: unknown;
  body?: Uint8Array;
  query?: Record<string, string | number | undefined>;
}

function toPayload(status: number, text: string): ErrorPayload {
  try {
    const parsed = JSON.parse(text) as Partial<ErrorPayload>;
    if (parsed.error && typeof parsed.error.code === "string") return parsed as ErrorPayload;
  } catch {
    // not JSON: fall through to a synthesized body
  }
  return { error: { code: `HTTP_${status}`, message: text.slice(0, 200) || `HTTP ${status}` } };
}

export class ApiClient {
  constructor(private readonly options: ClientOptions) {}

  private url(path: string, query: RequestInput["query"]): string {
    const url = new URL(`${this.options.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async send(method: string, path: string, input: RequestInput): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.options.key}`,
      "user-agent": this.options.userAgent,
    };
    let body: RequestInit["body"];
    if (input.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(input.json);
    } else if (input.body) {
      headers["content-type"] = "application/octet-stream";
      body = input.body as RequestInit["body"];
    }
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.options.fetch(this.url(path, input.query), { method, headers, body });
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw new NetworkError(`Cannot reach ${this.options.baseUrl}: ${reason}`);
      }
      if (response.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) return response;
      const seconds = Number(response.headers.get("retry-after")) || 1;
      await response.arrayBuffer();
      await this.options.sleep(Math.min(seconds * 1000, MAX_RETRY_WAIT_MS));
    }
  }

  async request<T>(method: string, path: string, input: RequestInput = {}): Promise<T> {
    const response = await this.send(method, path, input);
    const text = await response.text();
    if (!response.ok) throw new ApiError(response.status, toPayload(response.status, text));
    return (text ? JSON.parse(text) : undefined) as T;
  }

  listPreviews(query: { q?: string; limit?: number; cursor?: string }): Promise<PreviewList> {
    return this.request("GET", "/v1/previews", { query });
  }

  getPreview(name: string): Promise<PreviewDetail> {
    return this.request("GET", `/v1/previews/${name}`);
  }

  listFiles(name: string): Promise<FileListing> {
    return this.request("GET", `/v1/previews/${name}/files`);
  }

  plan(name: string, body: PlanDeploymentRequest): Promise<PlanDeploymentResponse> {
    return this.request("POST", `/v1/previews/${name}/deployments`, { json: body });
  }

  uploadBlob(hash: string, content: Uint8Array): Promise<unknown> {
    return this.request("PUT", `/v1/blobs/${hash}`, { body: content });
  }

  finalize(name: string, deploymentId: string): Promise<DeployResponse> {
    return this.request("POST", `/v1/previews/${name}/deployments/${deploymentId}/finalize`);
  }

  update(name: string, body: UpdatePreviewRequest): Promise<PreviewView> {
    return this.request("PATCH", `/v1/previews/${name}`, { json: body });
  }

  rollback(name: string, deploymentId?: string): Promise<PreviewView> {
    return this.request("POST", `/v1/previews/${name}/rollback`, {
      json: deploymentId ? { deploymentId } : {},
    });
  }

  createLink(name: string, body: Partial<CreateLinkRequest>): Promise<CreatedLink> {
    return this.request("POST", `/v1/previews/${name}/links`, { json: body });
  }

  listLinks(name: string): Promise<LinkList> {
    return this.request("GET", `/v1/previews/${name}/links`);
  }

  async revokeLink(name: string, id: string): Promise<void> {
    await this.request<undefined>("DELETE", `/v1/previews/${name}/links/${id}`);
  }

  async remove(name: string): Promise<void> {
    await this.request<undefined>("DELETE", `/v1/previews/${name}`);
  }
}
