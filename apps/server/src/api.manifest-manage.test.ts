// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import {
  DeployResponse,
  ErrorBody,
  PlanDeploymentResponse,
  PreviewDetail,
  PreviewList,
  PreviewView,
} from "@html-preview/shared";
import { buildFetchHandler } from "./server";
import { type Api, useApi } from "./test-support/api";
import { sha256Hex } from "./test-support/context";

const make = useApi();
const makePublic = useApi({ MAX_VISIBILITY: "public" });

async function fileEntry(content: string) {
  return { hash: await sha256Hex(content), size: new TextEncoder().encode(content).length };
}

async function manifestDeploy(api: Api, name: string, files: Record<string, string>) {
  const manifest: Record<string, { hash: string; size: number }> = {};
  const contentByHash = new Map<string, string>();
  for (const [path, content] of Object.entries(files)) {
    const entry = await fileEntry(content);
    manifest[path] = entry;
    contentByHash.set(entry.hash, content);
  }
  const planRes = await api.call("POST", `/v1/previews/${name}/deployments`, {
    body: { files: manifest },
  });
  expect(planRes.status).toBe(201);
  const plan = PlanDeploymentResponse.parse(await planRes.json());
  for (const hash of plan.missing) {
    const put = await api.call("PUT", `/v1/blobs/${hash}`, { body: contentByHash.get(hash) ?? "" });
    expect(put.status).toBe(200);
  }
  const fin = await api.call(
    "POST",
    `/v1/previews/${name}/deployments/${plan.deploymentId}/finalize`,
  );
  return { plan, fin, response: fin.ok ? DeployResponse.parse(await fin.json()) : null };
}

describe("manifest flow (H3-A3)", () => {
  test("re-deploying with one changed file uploads exactly one blob", async () => {
    const api = make();
    const first = await manifestDeploy(api, "flow", { "index.html": "<p>1</p>", "a.css": "a{}" });
    expect(first.plan.missing).toHaveLength(2);
    expect(first.response?.uploaded).toBe(2);
    const second = await manifestDeploy(api, "flow", { "index.html": "<p>2</p>", "a.css": "a{}" });
    expect(second.plan.missing).toHaveLength(1);
    expect(second.response?.uploaded).toBe(1);
    expect(second.response?.created).toBe(false);
    expect(second.response?.url).toBe(first.response?.url ?? "");
  });

  test("finalize with missing blobs is 409 BLOBS_MISSING; wrong bytes are 400 HASH_MISMATCH", async () => {
    const api = make();
    const entry = await fileEntry("<p>x</p>");
    const plan = PlanDeploymentResponse.parse(
      await (
        await api.call("POST", "/v1/previews/gap/deployments", {
          body: { files: { "index.html": entry } },
        })
      ).json(),
    );
    const fin = await api.call(
      "POST",
      `/v1/previews/gap/deployments/${plan.deploymentId}/finalize`,
    );
    expect(fin.status).toBe(409);
    expect(ErrorBody.parse(await fin.json()).error.code).toBe("BLOBS_MISSING");
    const bad = await api.call("PUT", `/v1/blobs/${entry.hash}`, { body: "different" });
    expect(bad.status).toBe(400);
    expect(ErrorBody.parse(await bad.json()).error.code).toBe("HASH_MISMATCH");
  });

  test("validates manifests and malformed JSON", async () => {
    const api = make();
    const empty = await api.call("POST", "/v1/previews/v/deployments", { body: { files: {} } });
    expect(empty.status).toBe(400);
    const malformed = await api.call("POST", "/v1/previews/v/deployments", {
      body: "{nope",
      headers: { "content-type": "application/json" },
    });
    expect(malformed.status).toBe(400);
    expect(ErrorBody.parse(await malformed.json()).error.code).toBe("BAD_REQUEST");
    const badHash = await api.call("PUT", "/v1/blobs/not-a-hash", { body: "x" });
    expect(badHash.status).toBe(400);
  });
});

describe("blob upload over a real socket", () => {
  test("streams the request body to the blob store", async () => {
    const api = make();
    const entry = await fileEntry("<p>streamed</p>");
    const server = Bun.serve({ port: 0, fetch: buildFetchHandler(api.ctx) });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/v1/blobs/${entry.hash}`, {
        method: "PUT",
        headers: { host: "localhost:3000", authorization: `Bearer ${api.key}` },
        body: new TextEncoder().encode("<p>streamed</p>"),
        signal: AbortSignal.timeout(3000),
      });
      expect(res.status).toBe(200);
      expect(await api.ctx.deps.blobs.has(entry.hash)).toBe(true);
    } finally {
      await server.stop(true);
    }
  });
});

describe("read and manage (H3-A5)", () => {
  async function seed(api: Api, name: string, html: string) {
    const res = await api.call("PUT", `/v1/previews/${name}`, {
      body: html,
      headers: { "content-type": "text/html" },
    });
    return DeployResponse.parse(await res.json());
  }

  test("list with filters and cursor, and detail with deployments", async () => {
    const api = make();
    await seed(api, "alpha", "<p>a</p>");
    await seed(api, "beta", "<p>b</p>");
    await seed(api, "beta", "<p>b2</p>");
    const page = PreviewList.parse(await (await api.call("GET", "/v1/previews?limit=1")).json());
    expect(page.previews.map((item) => item.name)).toEqual(["alpha"]);
    expect(page.nextCursor).toBe("alpha");
    const next = PreviewList.parse(
      await (await api.call("GET", `/v1/previews?limit=1&cursor=${page.nextCursor}`)).json(),
    );
    expect(next.previews.map((item) => item.name)).toEqual(["beta"]);
    expect(next.nextCursor).toBeNull();
    const q = PreviewList.parse(await (await api.call("GET", "/v1/previews?q=alp")).json());
    expect(q.previews).toHaveLength(1);
    const detail = PreviewDetail.parse(await (await api.call("GET", "/v1/previews/beta")).json());
    expect(detail.deployments).toHaveLength(2);
    expect(detail.deployments.filter((item) => item.current)).toHaveLength(1);
    expect((await api.call("GET", "/v1/previews/ghost")).status).toBe(404);
  });

  test("patch: ttl, pinned, rename, ceiling and conflicts", async () => {
    const api = make();
    await seed(api, "one", "<p>1</p>");
    await seed(api, "two", "<p>2</p>");
    const patched = PreviewView.parse(
      await (
        await api.call("PATCH", "/v1/previews/one", { body: { ttl: 0, pinned: true } })
      ).json(),
    );
    expect(patched.expiresAt).toBeNull();
    expect(patched.pinned).toBe(true);
    const renamed = PreviewView.parse(
      await (await api.call("PATCH", "/v1/previews/one", { body: { name: "uno" } })).json(),
    );
    expect(renamed.name).toBe("uno");
    expect((await api.call("GET", "/v1/previews/uno")).status).toBe(200);
    const taken = await api.call("PATCH", "/v1/previews/uno", { body: { name: "two" } });
    expect(taken.status).toBe(409);
    expect(ErrorBody.parse(await taken.json()).error.code).toBe("NAME_TAKEN");
    const ceiling = await api.call("PATCH", "/v1/previews/uno", { body: { visibility: "public" } });
    expect(ErrorBody.parse(await ceiling.json()).error.code).toBe("VISIBILITY_NOT_ALLOWED");
    const empty = await api.call("PATCH", "/v1/previews/uno", { body: {} });
    expect(empty.status).toBe(400);
  });

  test("public visibility is allowed when the ceiling is public", async () => {
    const api = makePublic();
    await seed(api, "open", "<p>o</p>");
    const res = await api.call("PATCH", "/v1/previews/open", { body: { visibility: "public" } });
    expect(PreviewView.parse(await res.json()).visibility).toBe("public");
  });

  test("rollback, delete and file reads", async () => {
    const api = make();
    const first = await seed(api, "site", "<p>v1</p>");
    await seed(api, "site", "<p>v2</p>");
    const files = await (await api.call("GET", "/v1/previews/site/files")).json();
    expect(Object.keys((files as { files: object }).files)).toEqual(["index.html"]);
    const read = await api.call("GET", "/v1/previews/site/files/index.html");
    expect(await read.text()).toBe("<p>v2</p>");
    expect(read.headers.get("content-type")).toContain("text/plain");
    expect(read.headers.get("content-security-policy")).toBe("sandbox");
    const old = await api.call(
      "GET",
      `/v1/previews/site/files/index.html?deployment=${first.deploymentId}`,
    );
    expect(await old.text()).toBe("<p>v1</p>");
    expect((await api.call("GET", "/v1/previews/site/files/nope.html")).status).toBe(404);

    const back = await api.call("POST", "/v1/previews/site/rollback");
    expect(PreviewView.parse(await back.json()).deployment?.id).toBe(first.deploymentId);
    expect((await api.call("POST", "/v1/previews/site/rollback")).status).toBe(409);

    expect((await api.call("DELETE", "/v1/previews/site")).status).toBe(204);
    expect((await api.call("GET", "/v1/previews/site")).status).toBe(404);
    expect((await api.call("DELETE", "/v1/previews/site")).status).toBe(404);
  });
});
