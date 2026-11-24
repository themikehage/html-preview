// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { DeployResponse, ErrorBody } from "@html-preview/shared";
import { zipSync } from "fflate";
import { bootstrapAdminKey } from "./domain/api-keys";
import { makeTarGz, useApi } from "./test-support/api";
import { useTestContext } from "./test-support/context";

const make = useApi();
const makeBare = useTestContext();
const makeSmall = useApi({ MAX_DEPLOY_BYTES: "100" });
const enc = (text: string) => new TextEncoder().encode(text);

describe("auth (H3-A1)", () => {
  test("missing or invalid keys get 401 UNAUTHORIZED with a fix", async () => {
    const api = make();
    for (const key of [null, "hp_wrong"]) {
      const res = await api.call("GET", "/v1/previews", { key });
      expect(res.status).toBe(401);
      const body = ErrorBody.parse(await res.json());
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.fix).toContain("Bearer");
    }
  });

  test("a valid key works and its use is recorded", async () => {
    const api = make();
    expect((await api.call("GET", "/v1/previews")).status).toBe(200);
    expect(api.ctx.deps.keys.findByHash(await sha(api.key))?.lastUsedAt).not.toBeNull();
  });

  test("bootstrap creates one admin key only when none exist and stores only its hash", async () => {
    const { ctx } = makeBare();
    const key = bootstrapAdminKey(ctx.deps);
    expect(key).toStartWith("hp_");
    expect(bootstrapAdminKey(ctx.deps)).toBeNull();
    const stored = ctx.deps.keys.findByHash(await sha(key ?? ""));
    expect(stored?.scopes).toContain("admin");
    expect(stored?.hash).not.toBe(key);
  });
});

async function sha(value: string): Promise<string> {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

describe("one-shot deploy (H3-A2, H3-A4)", () => {
  test("text/html deploys a page and returns the documented shape", async () => {
    const api = make();
    const res = await api.call("PUT", "/v1/previews/demo?message=first", {
      body: "<h1>hi</h1>",
      headers: { "content-type": "text/html" },
    });
    expect(res.status).toBe(201);
    const raw = await res.json();
    expect(Object.keys(raw as object)[0]).toBe("url");
    const body = DeployResponse.parse(raw);
    expect(body.created).toBe(true);
    expect(body.files).toBe(1);
    expect(body.uploaded).toBe(1);
    expect(body.url).toMatch(/^http:\/\/127\.0.0\.1:3000\/[\w-]{22}\/$/);
    expect(body.deploymentUrl).toContain(`@${body.deploymentId}/`);
    expect(body.warnings).toEqual([]);

    const again = await api.call("PUT", "/v1/previews/demo", {
      body: "<h1>hi</h1>",
      headers: { "content-type": "text/html" },
    });
    const second = DeployResponse.parse(await again.json());
    expect(again.status).toBe(200);
    expect(second.created).toBe(false);
    expect(second.uploaded).toBe(0);
    expect(second.url).toBe(body.url);
  });

  test("zip: strips a single top folder", async () => {
    const api = make();
    const zip = zipSync({
      "dist/index.html": enc("<p>zip</p>"),
      "dist/assets/app.js": enc("1"),
      "__MACOSX/x": enc("junk"),
    });
    const res = await api.call("PUT", "/v1/previews/zipped", {
      body: zip,
      headers: { "content-type": "application/zip" },
    });
    expect(res.status).toBe(201);
    const { url } = DeployResponse.parse(await res.json());
    const path = new URL(url).pathname;
    expect(await (await api.content(path)).text()).toBe("<p>zip</p>");
    expect((await api.content(`${path}assets/app.js`)).status).toBe(200);
  });

  test("zip-slip and hidden paths are rejected with INVALID_PATH", async () => {
    const api = make();
    for (const name of ["../evil.html", ".env"]) {
      const zip = zipSync({ "index.html": enc("x"), [name]: enc("y") });
      const res = await api.call("PUT", "/v1/previews/bad", {
        body: zip,
        headers: { "content-type": "application/zip" },
      });
      expect(res.status).toBe(400);
      expect(ErrorBody.parse(await res.json()).error.code).toBe("INVALID_PATH");
    }
    expect(api.ctx.deps.previews.findByName("bad")).toBeNull();
  });

  test("tar.gz deploys; links inside are rejected", async () => {
    const api = make();
    const ok = await api.call("PUT", "/v1/previews/tarred", {
      body: makeTarGz({ "index.html": "<p>tar</p>", "css/site.css": "a{}" }),
      headers: { "content-type": "application/gzip" },
    });
    expect(ok.status).toBe(201);
    const bad = await api.call("PUT", "/v1/previews/linked", {
      body: makeTarGz({ "index.html": "x" }, { symlink: "evil" }),
      headers: { "content-type": "application/gzip" },
    });
    expect(bad.status).toBe(400);
    expect(ErrorBody.parse(await bad.json()).error.code).toBe("INVALID_ARCHIVE");
  });

  test("multipart/form-data uses file names as paths", async () => {
    const api = make();
    const form = new FormData();
    form.append("a", new File(["<p>multi</p>"], "index.html"));
    form.append("b", new File(["body{}"], "css/site.css"));
    const res = await api.call("PUT", "/v1/previews/multi", { body: form });
    expect(res.status).toBe(201);
    expect(DeployResponse.parse(await res.json()).files).toBe(2);
  });

  test("unsupported types, bad names, oversize bodies and corrupt archives fail cleanly", async () => {
    const api = makeSmall();
    const type = await api.call("PUT", "/v1/previews/x", {
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(type.status).toBe(415);
    const name = await api.call("PUT", "/v1/previews/Bad_Name", {
      body: "x",
      headers: { "content-type": "text/html" },
    });
    expect(name.status).toBe(400);
    expect(ErrorBody.parse(await name.json()).error.code).toBe("INVALID_REQUEST");
    const big = await api.call("PUT", "/v1/previews/big", {
      body: "x".repeat(500),
      headers: { "content-type": "text/html", "content-length": "500" },
    });
    expect(big.status).toBe(413);
    const corrupt = await api.call("PUT", "/v1/previews/corrupt", {
      body: enc("not a zip"),
      headers: { "content-type": "application/zip" },
    });
    expect(ErrorBody.parse(await corrupt.json()).error.code).toBe("INVALID_ARCHIVE");
  });

  test("visibility above the instance ceiling is refused", async () => {
    const api = make();
    const res = await api.call("PUT", "/v1/previews/pub?visibility=public", {
      body: "x",
      headers: { "content-type": "text/html" },
    });
    expect(res.status).toBe(400);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("VISIBILITY_NOT_ALLOWED");
  });
});
