// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { DeployResponse } from "@html-preview/shared";
import { zipSync } from "fflate";
import { buildFetchHandler } from "./server";
import { type Api, useApi } from "./test-support/api";

const make = useApi({ MAX_VISIBILITY: "public" });
const enc = (text: string) => new TextEncoder().encode(text);

async function deploy(api: Api, name: string, files: Record<string, string>, query = "") {
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc(v)])));
  const res = await api.call("PUT", `/v1/previews/${name}${query}`, {
    body: zip,
    headers: { "content-type": "application/zip" },
  });
  const body = DeployResponse.parse(await res.json());
  return {
    ...body,
    path: new URL(body.url).pathname,
    fixedPath: new URL(body.deploymentUrl).pathname,
  };
}

const SITE = {
  "index.html":
    '<link href="/css/a.css"><script src="/js/app.js"></script><a href="//cdn.test/x">c</a><img src="img/rel.png"><form action="/post"></form>',
  "css/a.css": "a{}",
  "docs/index.html": "<p>docs</p>",
  "data.bin": "0123456789",
};

describe("path resolution (H3-A6)", () => {
  test("id serves the current deployment; root without slash redirects", async () => {
    const api = make();
    const site = await deploy(api, "site", SITE);
    const redirect = await api.content(site.path.slice(0, -1));
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe(site.path);
    expect((await api.content(site.path)).status).toBe(200);
    expect(await (await api.content(`${site.path}css/a.css`)).text()).toBe("a{}");
  });

  test("directories resolve to index.html and redirect to a trailing slash", async () => {
    const api = make();
    const site = await deploy(api, "site", SITE);
    expect(await (await api.content(`${site.path}docs/`)).text()).toBe("<p>docs</p>");
    const redirect = await api.content(`${site.path}docs?x=1`);
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe(`${site.path}docs/?x=1`);
  });

  test("a custom entry is served at the root", async () => {
    const api = make();
    const site = await deploy(api, "custom", { "home.html": "<p>home</p>" }, "?entry=home.html");
    expect(await (await api.content(site.path)).text()).toBe("<p>home</p>");
  });

  test("<id>@<deploymentId> stays on its deployment after a newer deploy", async () => {
    const api = make();
    const first = await deploy(api, "pin", { "index.html": "v1" });
    const second = await deploy(api, "pin", { "index.html": "v2" });
    expect(await (await api.content(first.fixedPath)).text()).toBe("v1");
    expect(await (await api.content(second.path)).text()).toBe("v2");
    expect(first.path).toBe(second.path);
  });

  test("name alias works only for public previews", async () => {
    const api = make();
    await deploy(api, "named", { "index.html": "hi" });
    expect((await api.content("/named/")).status).toBe(404);
    await api.call("PATCH", "/v1/previews/named", { body: { visibility: "public" } });
    expect(await (await api.content("/named/")).text()).toBe("hi");
  });

  test("private, expired, unknown and hidden paths are plain 404s", async () => {
    const api = make();
    const site = await deploy(api, "locked", { "index.html": "x", "a.txt": "y" });
    expect((await api.content(`${site.path}.env`)).status).toBe(404);
    expect((await api.content(`${site.path}../x`)).status).toBe(404);
    expect((await api.content(`${site.path}nope.html`)).status).toBe(404);
    expect((await api.content("/")).status).toBe(404);
    await api.call("PATCH", "/v1/previews/locked", { body: { visibility: "private" } });
    const privateRes = await api.content(site.path);
    expect(privateRes.status).toBe(404);
    expect(privateRes.headers.get("content-type")).toContain("text/plain");
    await api.call("PATCH", "/v1/previews/locked", { body: { visibility: "unlisted" } });
    expect((await api.content(site.path)).status).toBe(200);
    api.clock.advance(8 * 24 * 3600);
    expect((await api.content(site.path)).status).toBe(404);
    await api.call("PATCH", "/v1/previews/locked", { body: { pinned: true } });
    expect((await api.content(site.path)).status).toBe(200);
  });

  test("only GET and HEAD are allowed; deleted previews vanish", async () => {
    const api = make();
    const site = await deploy(api, "gone", { "index.html": "x" });
    expect((await api.content(site.path, { method: "POST" })).status).toBe(405);
    const head = await api.content(site.path, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    await api.call("DELETE", "/v1/previews/gone");
    expect((await api.content(site.path)).status).toBe(404);
  });
});

describe("headers and rewriting (H3-A7)", () => {
  test("every content response carries the sandbox policy without allow-same-origin", async () => {
    const api = make();
    const site = await deploy(api, "sec", SITE);
    for (const path of [
      site.path,
      `${site.path}css/a.css`,
      `${site.path}missing`,
      `${site.path}docs`,
    ]) {
      const res = await api.content(path);
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).toStartWith(
        "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads",
      );
      expect(csp).not.toContain("allow-same-origin");
      expect(csp).toContain("frame-ancestors http://localhost:3000");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("permissions-policy")).toContain("camera=()");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  test("content types come from the file extension", async () => {
    const api = make();
    const site = await deploy(api, "types", SITE);
    expect((await api.content(site.path)).headers.get("content-type")).toContain("text/html");
    expect((await api.content(`${site.path}css/a.css`)).headers.get("content-type")).toContain(
      "text/css",
    );
  });

  test("root-relative URLs in HTML are rewritten under the prefix", async () => {
    const api = make();
    const site = await deploy(api, "rw", SITE);
    const html = await (await api.content(site.path)).text();
    expect(html).toContain(`href="${site.path.slice(0, -1)}/css/a.css"`);
    expect(html).toContain(`src="${site.path.slice(0, -1)}/js/app.js"`);
    expect(html).toContain(`action="${site.path.slice(0, -1)}/post"`);
    expect(html).toContain('href="//cdn.test/x"');
    expect(html).toContain('src="img/rel.png"');
    const fixed = await (await api.content(site.fixedPath)).text();
    expect(fixed).toContain(`href="${site.fixedPath.slice(0, -1)}/css/a.css"`);
  });
});

describe("caching and ranges (H3-A8)", () => {
  test("deployment URLs are immutable; alias URLs revalidate with ETag and 304", async () => {
    const api = make();
    const site = await deploy(api, "cache", SITE);
    const fixed = await api.content(`${site.fixedPath}css/a.css`);
    expect(fixed.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const alias = await api.content(`${site.path}css/a.css`);
    expect(alias.headers.get("cache-control")).toBe("no-cache");
    const etag = alias.headers.get("etag") ?? "";
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    const cached = await api.content(`${site.path}css/a.css`, {
      headers: { "if-none-match": etag },
    });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe("");
    const stale = await api.content(`${site.path}css/a.css`, {
      headers: { "if-none-match": '"other"' },
    });
    expect(stale.status).toBe(200);
  });

  test("Range requests return 206 with Content-Range, 416 when unsatisfiable", async () => {
    const api = make();
    const site = await deploy(api, "range", SITE);
    const url = `${site.path}data.bin`;
    const part = await api.content(url, { headers: { range: "bytes=2-4" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(await part.text()).toBe("234");
    const tail = await api.content(url, { headers: { range: "bytes=-3" } });
    expect(await tail.text()).toBe("789");
    const open = await api.content(url, { headers: { range: "bytes=8-" } });
    expect(await open.text()).toBe("89");
    const bad = await api.content(url, { headers: { range: "bytes=50-60" } });
    expect(bad.status).toBe(416);
    expect(bad.headers.get("content-range")).toBe("bytes */10");
    const full = await api.content(url);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(await full.text()).toBe("0123456789");
  });
});

describe("real socket", () => {
  test("rewritten HTML is delivered over HTTP with its security headers", async () => {
    const api = make();
    const site = await deploy(api, "socket", SITE);
    const handler = buildFetchHandler(api.ctx);
    const server = Bun.serve({ port: 0, fetch: handler });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}${site.path}`, {
        headers: { host: "127.0.0.1:3000" },
        signal: AbortSignal.timeout(3000),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-security-policy")).toContain("sandbox");
      expect(await res.text()).toContain(`href="${site.path.slice(0, -1)}/css/a.css"`);
    } finally {
      await server.stop(true);
    }
  });
});
