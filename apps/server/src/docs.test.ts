// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ERROR_CODES, MCP_TOOL_NAMES, OPERATIONS, routePattern } from "@html-preview/shared";
import { createApp } from "./routes/app";
import { buildLlmsTxt } from "./routes/docs/llms-txt";
import { buildOpenApi } from "./routes/docs/openapi";
import { DOC_SNAPSHOT_ORIGIN, DOC_SNAPSHOT_VERSION } from "./routes/docs/snapshot";
import { useApi } from "./test-support/api";

const make = useApi();
const root = join(import.meta.dir, "..", "..", "..");
const REGENERATE = "Run `bun run gen:docs` and commit docs/*.snapshot.*";

describe("agent docs (H5-A5)", () => {
  test("GET /openapi.json and /llms.txt are public and generated", async () => {
    const api = make();
    const spec = await api.call("GET", "/openapi.json", { key: null });
    expect(spec.status).toBe(200);
    const body = (await spec.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(body.openapi).toBe("3.0.3");
    expect(Object.keys(body.paths)).toContain("/v1/previews/{name}");
    const llms = await api.call("GET", "/llms.txt", { key: null });
    expect(llms.status).toBe(200);
    expect(llms.headers.get("content-type")).toContain("text/plain");
    const text = await llms.text();
    for (const code of ERROR_CODES) expect(text).toContain(code);
    for (const tool of MCP_TOOL_NAMES) expect(text).toContain(tool);
    expect(text).toContain("Authorization: Bearer");
  });

  test("operations carry schemas: query params, request bodies, scopes and responses", () => {
    const spec = buildOpenApi({ version: "1", serverUrl: "http://x" }) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    const deploy = spec.paths["/v1/previews/{name}"]?.put;
    expect(deploy?.["x-required-scope"]).toBe("deploy");
    expect(Object.keys((deploy?.requestBody as { content: object }).content)).toContain(
      "application/zip",
    );
    const params = (deploy?.parameters as { name: string; in: string; required: boolean }[]).map(
      (param) => `${param.in}:${param.name}:${param.required}`,
    );
    expect(params).toContain("path:name:true");
    expect(params).toContain("query:ttl:false");
    expect(spec.paths["/healthz"]?.get?.security).toBeUndefined();
  });
});

describe("contract (H5-A7)", () => {
  test("every OpenAPI operation maps to a real route and every /v1 route is documented", () => {
    const { ctx } = make();
    const app = createApp(ctx);
    const actual = new Set(
      app.routes
        .filter((route) => route.method !== "ALL")
        .filter((route) => route.path.startsWith("/v1") || route.path === "/healthz")
        .map((route) => `${route.method} ${route.path}`),
    );
    const documented = new Set(
      OPERATIONS.map(
        (operation) => `${operation.method.toUpperCase()} ${routePattern(operation.path)}`,
      ),
    );
    expect([...documented].filter((entry) => !actual.has(entry))).toEqual([]);
    expect([...actual].filter((entry) => !documented.has(entry))).toEqual([]);
  });

  test("operation ids are unique and MCP tool names are unique", () => {
    expect(new Set(OPERATIONS.map((operation) => operation.id)).size).toBe(OPERATIONS.length);
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length);
  });

  test("committed snapshots match the generated docs (schema change without regenerating fails)", () => {
    const openapi = readFileSync(join(root, "docs/openapi.snapshot.json"), "utf8");
    const generated = `${JSON.stringify(
      buildOpenApi({ version: DOC_SNAPSHOT_VERSION, serverUrl: DOC_SNAPSHOT_ORIGIN }),
      null,
      2,
    )}\n`;
    expect(openapi, REGENERATE).toBe(generated);
    const llms = readFileSync(join(root, "docs/llms.snapshot.txt"), "utf8");
    expect(llms, REGENERATE).toBe(buildLlmsTxt(DOC_SNAPSHOT_ORIGIN));
  });
});
