// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { CreatedKey, ErrorBody, KeyList, Usage } from "@html-preview/shared";
import { zipSync } from "fflate";
import { type Api, useApi } from "./test-support/api";

const enc = (text: string) => new TextEncoder().encode(text);
const html = { "content-type": "text/html" };

async function errorOf(res: Response): Promise<{ status: number; code: string; fix?: string }> {
  const { error } = ErrorBody.parse(await res.json());
  return { status: res.status, code: error.code, ...(error.fix ? { fix: error.fix } : {}) };
}

async function mintKey(api: Api, label: string, scopes: string[]): Promise<string> {
  const res = await api.call("POST", "/v1/keys", { body: { label, scopes } });
  expect(res.status).toBe(201);
  return CreatedKey.parse(await res.json()).key;
}

const makeSmall = useApi({ MAX_DEPLOY_BYTES: "400", MAX_DEPLOY_FILES: "2" });
const makeTiny = useApi({ MAX_TOTAL_BYTES: "300" });
const make = useApi();

describe("quotas (H4-A1)", () => {
  test("one-shot body above MAX_DEPLOY_BYTES → 413 DEPLOY_TOO_LARGE with a fix", async () => {
    const api = makeSmall();
    const res = await api.call("PUT", "/v1/previews/big", { body: "x".repeat(500), headers: html });
    const error = await errorOf(res);
    expect(error).toMatchObject({ status: 413, code: "DEPLOY_TOO_LARGE" });
    expect(error.fix).toContain("MAX_DEPLOY_BYTES");
  });

  test("archive with too many files → 413 TOO_MANY_FILES", async () => {
    const api = makeSmall();
    const zip = zipSync({ "a.txt": enc("1"), "b.txt": enc("2"), "c.txt": enc("3") });
    const res = await api.call("PUT", "/v1/previews/many", {
      body: zip,
      headers: { "content-type": "application/zip" },
    });
    expect(await errorOf(res)).toMatchObject({ status: 413, code: "TOO_MANY_FILES" });
  });

  test("archive above the byte limit once extracted → DEPLOY_TOO_LARGE", async () => {
    const api = makeSmall();
    const zip = zipSync({ "index.html": enc("a".repeat(5000)) });
    const res = await api.call("PUT", "/v1/previews/inflate", {
      body: zip,
      headers: { "content-type": "application/zip" },
    });
    expect(await errorOf(res)).toMatchObject({ status: 413, code: "DEPLOY_TOO_LARGE" });
  });

  test("manifest plan is checked from declared sizes and counts, before any upload", async () => {
    const api = makeSmall();
    const hash = "a".repeat(64);
    const big = await api.call("POST", "/v1/previews/m1/deployments", {
      body: { files: { "index.html": { hash, size: 5000 } } },
    });
    expect(await errorOf(big)).toMatchObject({ status: 413, code: "DEPLOY_TOO_LARGE" });
    const files = Object.fromEntries(
      [
        ["index", "a"],
        ["b", "b"],
        ["c", "c"],
      ].map(([n, h]) => [`${n}.html`, { hash: String(h).repeat(64), size: 1 }]),
    );
    const many = await api.call("POST", "/v1/previews/m2/deployments", { body: { files } });
    expect(await errorOf(many)).toMatchObject({ status: 413, code: "TOO_MANY_FILES" });
    expect(api.ctx.deps.previews.count()).toBe(0);
  });

  test("blob upload above MAX_DEPLOY_BYTES while streaming → 413", async () => {
    const api = makeSmall();
    const content = "y".repeat(500);
    const hash = new Bun.CryptoHasher("sha256").update(content).digest("hex");
    const res = await api.call("PUT", `/v1/blobs/${hash}`, { body: content });
    expect(await errorOf(res)).toMatchObject({ status: 413, code: "DEPLOY_TOO_LARGE" });
  });

  test("storage above MAX_TOTAL_BYTES → 409 INSTANCE_FULL for deploys and blob uploads", async () => {
    const api = makeTiny();
    const first = await api.call("PUT", "/v1/previews/one", {
      body: "a".repeat(200),
      headers: html,
    });
    expect(first.status).toBe(201);
    const second = await api.call("PUT", "/v1/previews/two", {
      body: "b".repeat(200),
      headers: html,
    });
    const error = await errorOf(second);
    expect(error).toMatchObject({ status: 409, code: "INSTANCE_FULL" });
    expect(error.fix).toContain("MAX_TOTAL_BYTES");
    const blob = await api.call("PUT", `/v1/blobs/${"c".repeat(64)}`, {
      body: "c".repeat(200),
      headers: { "content-length": "200" },
    });
    expect(await errorOf(blob)).toMatchObject({ status: 409, code: "INSTANCE_FULL" });
  });

  test("identical content does not count twice against the instance quota", async () => {
    const api = makeTiny();
    for (const name of ["a", "b", "c"]) {
      const res = await api.call("PUT", `/v1/previews/${name}`, {
        body: "z".repeat(200),
        headers: html,
      });
      expect(res.status).toBe(201);
    }
  });
});

describe("scopes and keys (H4-A2)", () => {
  test("a read key lists but cannot deploy, patch, delete or upload blobs", async () => {
    const api = make();
    const reader = await mintKey(api, "reader", ["read"]);
    expect((await api.call("GET", "/v1/previews", { key: reader })).status).toBe(200);
    const calls: [string, string][] = [
      ["PUT", "/v1/previews/x"],
      ["PATCH", "/v1/previews/x"],
      ["DELETE", "/v1/previews/x"],
      ["PUT", `/v1/blobs/${"a".repeat(64)}`],
    ];
    for (const [method, path] of calls) {
      const res = await api.call(method, path, { key: reader, body: "x", headers: html });
      expect(await errorOf(res)).toMatchObject({ status: 403, code: "INSUFFICIENT_SCOPE" });
    }
  });

  test("a deploy key deploys, records its label as createdBy, and cannot read or admin", async () => {
    const api = make();
    const deployer = await mintKey(api, "ci@laptop", ["deploy"]);
    const res = await api.call("PUT", "/v1/previews/site", {
      key: deployer,
      body: "<p>x</p>",
      headers: html,
    });
    expect(res.status).toBe(201);
    expect(api.ctx.deps.previews.findByName("site")?.createdBy).toBe("ci@laptop");
    expect((await api.call("GET", "/v1/previews", { key: deployer })).status).toBe(403);
    for (const path of ["/v1/keys", "/v1/usage"]) {
      const denied = await api.call("GET", path, { key: deployer });
      expect(await errorOf(denied)).toMatchObject({ status: 403, code: "INSUFFICIENT_SCOPE" });
    }
  });

  test("keys: create shows the token once, list hides secrets, revoke stops the key", async () => {
    const api = make();
    const created = CreatedKey.parse(
      await (
        await api.call("POST", "/v1/keys", { body: { label: "bot", scopes: ["deploy", "deploy"] } })
      ).json(),
    );
    expect(created.key).toStartWith("hp_");
    expect(created.scopes).toEqual(["deploy"]);
    const listing = await api.call("GET", "/v1/keys");
    const text = await listing.text();
    expect(text).not.toContain(created.key);
    expect(text).not.toContain("hash");
    expect(KeyList.parse(JSON.parse(text)).keys.map((key) => key.label)).toContain("bot");
    expect((await api.call("DELETE", `/v1/keys/${created.id}`)).status).toBe(204);
    expect((await api.call("GET", "/v1/previews", { key: created.key })).status).toBe(401);
    expect(await errorOf(await api.call("DELETE", `/v1/keys/${created.id}`))).toMatchObject({
      status: 404,
      code: "KEY_NOT_FOUND",
    });
  });

  test("the last admin key cannot be revoked; invalid bodies are rejected", async () => {
    const api = make();
    const [only] = KeyList.parse(await (await api.call("GET", "/v1/keys")).json()).keys;
    const res = await api.call("DELETE", `/v1/keys/${only?.id}`);
    expect(await errorOf(res)).toMatchObject({ status: 409, code: "LAST_ADMIN_KEY" });
    const bad = await api.call("POST", "/v1/keys", { body: { label: "", scopes: [] } });
    expect(bad.status).toBe(400);
  });
});

describe("rate limit (H4-A3)", () => {
  test("per-key token bucket → 429 RATE_LIMITED with Retry-After, refills with time", async () => {
    const api = useApi({ RATE_LIMIT_PER_MIN: "3" })();
    for (let i = 0; i < 3; i++) expect((await api.call("GET", "/v1/previews")).status).toBe(200);
    const limited = await api.call("GET", "/v1/previews");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await errorOf(limited)).code).toBe("RATE_LIMITED");
    api.clock.advance(21);
    expect((await api.call("GET", "/v1/previews")).status).toBe(200);
  });

  test("limits are per key and 0 disables them", async () => {
    const api = useApi({ RATE_LIMIT_PER_MIN: "2" })();
    const other = await mintKey(api, "other", ["read"]);
    expect((await api.call("GET", "/v1/previews")).status).toBe(200);
    expect((await api.call("GET", "/v1/previews")).status).toBe(429);
    expect((await api.call("GET", "/v1/previews", { key: other })).status).toBe(200);
    const free = useApi({ RATE_LIMIT_PER_MIN: "0" })();
    for (let i = 0; i < 50; i++) expect((await free.call("GET", "/v1/previews")).status).toBe(200);
  });
});

describe("usage (H4-A7)", () => {
  test("admin sees totals, per-key usage and quota headroom", async () => {
    const api = make();
    const deployer = await mintKey(api, "ci", ["deploy"]);
    await api.call("PUT", "/v1/previews/a", { key: deployer, body: "<p>aaaa</p>", headers: html });
    await api.call("PUT", "/v1/previews/b", { body: "<p>bb</p>", headers: html });
    const usage = Usage.parse(await (await api.call("GET", "/v1/usage")).json());
    expect(usage.totals).toEqual({ previews: 2, deployments: 2, storedBytes: 11 + 9 });
    expect(usage.quota.remainingBytes).toBe(usage.quota.maxTotalBytes - 20);
    expect(usage.quota.keepDeployments).toBe(10);
    const ci = usage.keys.find((key) => key.label === "ci");
    expect(ci).toMatchObject({ deployments: 1, bytes: 11 });
    expect(JSON.stringify(usage)).not.toContain("hash");
  });
});
