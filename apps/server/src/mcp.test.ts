// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { DeployResponse, ErrorBody, MCP_TOOL_NAMES } from "@html-preview/shared";
import { type Api, useApi } from "./test-support/api";

const make = useApi();
const makeSmall = useApi({ MCP_MAX_INLINE_BYTES: "50" });

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
}

async function rpc(api: Api, method: string, params: object = {}, key?: string | null) {
  const res = await api.call("POST", "/mcp", {
    body: { jsonrpc: "2.0", id: 1, method, params },
    headers: { accept: "application/json, text/event-stream" },
    ...(key !== undefined ? { key } : {}),
  });
  return res;
}

async function tool(
  api: Api,
  name: string,
  args: object,
  key?: string | null,
): Promise<ToolResult> {
  const res = await rpc(api, "tools/call", { name, arguments: args }, key);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { result?: ToolResult; error?: { message: string } };
  if (!body.result) throw new Error(body.error?.message ?? "no result");
  return body.result;
}

describe("MCP server (H5-A1, H5-A2)", () => {
  test("requires the same bearer keys as /v1", async () => {
    const api = make();
    for (const key of [null, "hp_wrong"]) {
      const res = await rpc(api, "tools/list", {}, key);
      expect(res.status).toBe(401);
      expect(ErrorBody.parse(await res.json()).error.code).toBe("UNAUTHORIZED");
    }
  });

  test("only POST is accepted", async () => {
    const api = make();
    const res = await api.call("GET", "/mcp");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  test("lists exactly the shared tool names, with annotations, no share tools yet", async () => {
    const api = make();
    const res = await rpc(api, "tools/list");
    const body = (await res.json()) as {
      result: {
        tools: {
          name: string;
          annotations: Record<string, boolean>;
          inputSchema: { properties: object };
        }[];
      };
    };
    const tools = body.result.tools;
    expect(tools.map((item) => item.name)).toEqual([...MCP_TOOL_NAMES]);
    expect(tools.some((item) => item.name.includes("share"))).toBe(false);
    const byName = Object.fromEntries(tools.map((item) => [item.name, item.annotations]));
    for (const name of ["list_previews", "get_preview"])
      expect(byName[name]?.readOnlyHint).toBe(true);
    expect(byName.delete_preview?.destructiveHint).toBe(true);
    expect(byName.deploy_html?.destructiveHint).toBe(false);
    for (const item of tools)
      expect(Object.keys(item.inputSchema.properties).length).toBeGreaterThan(0);
  });

  test("tools take flat arguments (no action multiplexing)", async () => {
    const api = make();
    const res = await rpc(api, "tools/list");
    const body = (await res.json()) as {
      result: { tools: { inputSchema: { properties: Record<string, unknown> } }[] };
    };
    for (const item of body.result.tools)
      expect(Object.keys(item.inputSchema.properties)).not.toContain("action");
  });
});

describe("MCP deploy tools (H5-A3, H5-A4)", () => {
  test("deploy_html returns the URL first, structured content and a servable page", async () => {
    const api = make();
    const result = await tool(api, "deploy_html", { name: "hello", html: "<h1>hello mcp</h1>" });
    expect(result.isError).toBeFalsy();
    const response = DeployResponse.parse(result.structuredContent);
    expect(result.content[0]?.text.startsWith(response.url)).toBe(true);
    expect(api.ctx.deps.previews.findByName("hello")?.createdBy).toBe("tester");
    const page = await api.content(`${new URL(response.url).pathname}`);
    expect([200, 308]).toContain(page.status);
    const served = await api.content(`${new URL(response.url).pathname}`.replace(/\/?$/, "/"));
    expect(await served.text()).toContain("hello mcp");
  });

  test("deploy_files publishes several files and surfaces warnings in the summary", async () => {
    const api = make();
    const result = await tool(api, "deploy_files", {
      name: "site",
      files: {
        "index.html": '<script src="app.js"></script>',
        "app.js": 'fetch("/api/data.json")',
      },
    });
    const response = DeployResponse.parse(result.structuredContent);
    expect(response.files).toBe(2);
    expect(response.warnings.map((warning) => warning.code)).toEqual(["ROOT_RELATIVE_URL"]);
    expect(result.content[0]?.text).toContain("ROOT_RELATIVE_URL (app.js)");
  });

  test("payloads above MCP_MAX_INLINE_BYTES fail with INLINE_TOO_LARGE and the exact CLI command", async () => {
    const api = makeSmall();
    const result = await tool(api, "deploy_files", {
      name: "big-site",
      files: { "index.html": "x".repeat(200) },
    });
    expect(result.isError).toBe(true);
    const { error } = ErrorBody.parse(result.structuredContent);
    expect(error.code).toBe("INLINE_TOO_LARGE");
    expect(error.fix).toBe(
      "Deploy folders with the CLI: npx html-preview deploy ./<folder> --name big-site",
    );
    const html = await tool(api, "deploy_html", { name: "big-page", html: "y".repeat(200) });
    expect(ErrorBody.parse(html.structuredContent).error.code).toBe("INLINE_TOO_LARGE");
    expect(api.ctx.deps.previews.count()).toBe(0);
  });

  test("domain errors keep their code and fix", async () => {
    const api = make();
    const result = await tool(api, "deploy_html", {
      name: "x",
      html: "<p>x</p>",
      visibility: "public",
    });
    expect(result.isError).toBe(true);
    expect(ErrorBody.parse(result.structuredContent).error.code).toBe("VISIBILITY_NOT_ALLOWED");
    expect(result.content[0]?.text).toContain("Fix:");
  });
});

describe("MCP manage tools and scopes", () => {
  test("list, get, update, rollback and delete go through the same domain services", async () => {
    const api = make();
    await tool(api, "deploy_html", { name: "app", html: "<p>v1</p>" });
    api.clock.advance(1);
    await tool(api, "deploy_html", { name: "app", html: "<p>v2</p>" });
    const listed = await tool(api, "list_previews", { query: "ap" });
    expect(listed.content[0]?.text).toContain("app: http");
    const got = await tool(api, "get_preview", { name: "app" });
    expect((got.structuredContent as { deployments: unknown[] }).deployments).toHaveLength(2);
    const updated = await tool(api, "update_preview", { name: "app", pinned: true, ttlHours: 5 });
    expect(updated.structuredContent).toMatchObject({ pinned: true });
    const rolled = await tool(api, "rollback_preview", { name: "app" });
    expect(rolled.isError).toBeFalsy();
    const deleted = await tool(api, "delete_preview", { name: "app" });
    expect(deleted.content[0]?.text).toBe('Deleted "app".');
    const missing = await tool(api, "get_preview", { name: "app" });
    expect(ErrorBody.parse(missing.structuredContent).error.code).toBe("PREVIEW_NOT_FOUND");
  });

  test("scopes apply to tools: read-only keys cannot deploy, deploy-only keys cannot list", async () => {
    const api = make();
    const mint = async (scopes: string[]) =>
      (
        (await (
          await api.call("POST", "/v1/keys", { body: { label: scopes.join(), scopes } })
        ).json()) as { key: string }
      ).key;
    const reader = await mint(["read"]);
    const deployer = await mint(["deploy"]);
    const denied = await tool(api, "deploy_html", { name: "n", html: "<p>x</p>" }, reader);
    expect(ErrorBody.parse(denied.structuredContent).error.code).toBe("INSUFFICIENT_SCOPE");
    expect((await tool(api, "list_previews", {}, reader)).isError).toBeFalsy();
    expect(
      (await tool(api, "deploy_html", { name: "n", html: "<p>x</p>" }, deployer)).isError,
    ).toBeFalsy();
    const noRead = await tool(api, "list_previews", {}, deployer);
    expect(ErrorBody.parse(noRead.structuredContent).error.code).toBe("INSUFFICIENT_SCOPE");
  });

  test("MCP requests share the per-key rate limit with /v1", async () => {
    const api = useApi({ RATE_LIMIT_PER_MIN: "2" })();
    expect((await rpc(api, "tools/list")).status).toBe(200);
    expect((await api.call("GET", "/v1/previews")).status).toBe(200);
    expect((await rpc(api, "tools/list")).status).toBe(429);
  });
});
