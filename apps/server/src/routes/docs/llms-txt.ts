// SPDX-License-Identifier: MIT

import { ERROR_CODES, MCP_TOOL_NAMES, OPERATIONS } from "@html-preview/shared";

export function buildLlmsTxt(appOrigin: string): string {
  const endpoints = OPERATIONS.filter((operation) => operation.scope !== null)
    .map(
      (operation) =>
        `- ${operation.method.toUpperCase()} ${operation.path} [${operation.scope}]: ${operation.summary}`,
    )
    .join("\n");
  return `# html-preview

> Self-hosted server that turns an HTML page or a static folder into a stable preview URL in under a second. Built for AI agents: deploy, get the URL, share it.

Base URL: ${appOrigin}
OpenAPI: ${appOrigin}/openapi.json
MCP (streamable HTTP, POST only): ${appOrigin}/mcp
Content is served from a separate origin and is sandboxed: no cookies, no storage, relative asset URLs only.

## Authentication

Every /v1 and /mcp request needs \`Authorization: Bearer <api key>\` (keys start with hp_). Scopes: read (GET), deploy (create/change/delete previews), admin (keys, usage). admin implies all.

## Common flows

1. Single page (80% of cases)
   curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: text/html" --data-binary @index.html "${appOrigin}/v1/previews/my-page?ttl=24"
   The response starts with "url": open or share it. Re-deploying the same name updates the preview.

2. Folder (build output)
   zip -r site.zip dist && curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/zip" --data-binary @site.zip ${appOrigin}/v1/previews/my-site
   A single top-level folder is stripped. Use relative asset URLs (Vite: base './'); read "warnings" in the response.

3. Large or incremental deploys (manifest)
   POST /v1/previews/{name}/deployments with {"files": {"index.html": {"hash": "<sha256>", "size": 123}}} -> {"deploymentId", "missing": [hashes]}
   PUT /v1/blobs/{sha256} for each missing hash, then POST /v1/previews/{name}/deployments/{id}/finalize.

Roll back with POST /v1/previews/{name}/rollback; delete with DELETE /v1/previews/{name}.

## Endpoints

${endpoints}

## MCP tools

${MCP_TOOL_NAMES.join(", ")}

## Errors

Errors are JSON: {"error": {"code", "message", "fix"}}. Follow "fix". Codes: ${ERROR_CODES.join(", ")}.

## Deploy warnings

Deploy responses include "warnings": ROOT_RELATIVE_URL, NO_ENTRY_HTML, LOCALHOST_URL, MIXED_CONTENT, LARGE_FILE, each with the offending "file" and a "fix".
`;
}
