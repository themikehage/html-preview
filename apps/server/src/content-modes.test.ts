// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { CreatedLink, DeployResponse } from "@html-preview/shared";
import { zipSync } from "fflate";
import { mintTicket } from "./domain/capability";
import { type Api, useApi } from "./test-support/api";

const enc = (text: string) => new TextEncoder().encode(text);

type Mode = "path" | "subdomain";

const ENV: Record<Mode, Record<string, string>> = {
  path: { MAX_VISIBILITY: "public" },
  subdomain: {
    MAX_VISIBILITY: "public",
    CONTENT_MODE: "subdomain",
    CONTENT_ORIGIN: "http://content.test:3000",
  },
};

async function deploy(api: Api, name: string, files: Record<string, string>, query = "") {
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc(v)])));
  const res = await api.call("PUT", `/v1/previews/${name}?${query}`, {
    body: zip,
    headers: { "content-type": "application/zip" },
  });
  expect(res.status).toBe(201);
  return DeployResponse.parse(await res.json());
}

describe.each(["path", "subdomain"] as Mode[])("content server, %s mode (H9-A6)", (mode) => {
  const make = useApi(ENV[mode]);
  const get = (api: Api, url: string, headers: Record<string, string> = {}) => {
    const { host, pathname, search } = new URL(url);
    return api.call("GET", `${pathname}${search}`, { host, key: null, headers });
  };
  const aliasUrl = (name: string) =>
    mode === "path" ? `http://127.0.0.1:3000/${name}/` : `http://${name}.content.test:3000/`;

  test("serves by id and by pinned deployment, with the mode's sandbox (H9-A1, H9-A2)", async () => {
    const api = make();
    const out = await deploy(api, "demo", { "index.html": "<h1>hola</h1>" });
    if (mode === "subdomain") {
      expect(out.url).toMatch(/^http:\/\/[a-z2-7]{26}\.content\.test:3000\/$/);
      expect(out.deploymentUrl).toMatch(
        /^http:\/\/[a-z2-7]{26}--[a-z2-7]{26}\.content\.test:3000\/$/,
      );
    }
    const page = await get(api, out.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toBe("<h1>hola</h1>");
    const csp = page.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("sandbox");
    expect(csp.includes("allow-same-origin")).toBe(mode === "subdomain");

    const pinned = await get(api, out.deploymentUrl);
    expect(pinned.status).toBe(200);
    expect(pinned.headers.get("cache-control")).toContain("immutable");
  });

  test("the name alias serves only public previews (H9-A1)", async () => {
    const api = make();
    await deploy(api, "quiet", { "index.html": "x" });
    expect((await get(api, aliasUrl("quiet"))).status).toBe(404);
    await deploy(api, "loud", { "index.html": "y" }, "visibility=public");
    expect((await get(api, aliasUrl("loud"))).status).toBe(200);
  });

  test("root-relative URLs are rewritten only in path mode, and warned about only there (H9-A2)", async () => {
    const api = make();
    const out = await deploy(api, "site", {
      "index.html": '<link rel="stylesheet" href="/app.css"><script src="/main.js"></script>',
      "app.css": "body{}",
      "main.js": 'fetch("/data/items.json")',
    });
    const html = await (await get(api, out.url)).text();
    if (mode === "path")
      expect(html).toContain(`href="/${new URL(out.url).pathname.split("/")[1]}/app.css"`);
    else expect(html).toContain('href="/app.css"');
    expect(out.warnings.some((w) => w.code === "ROOT_RELATIVE_URL")).toBe(mode === "path");
    expect((await get(api, `${out.url}app.css`)).status).toBe(200);
  });

  test("spa previews fall back to the entry for extensionless unknown paths (H9-A4)", async () => {
    const api = make();
    const plain = await deploy(api, "plain", { "index.html": "<p>home</p>", "app.js": "1" });
    expect((await get(api, `${plain.url}deep/link`)).status).toBe(404);

    const spa = await deploy(
      api,
      "app",
      { "index.html": "<p>home</p>", "app.js": "1" },
      "spa=true",
    );
    expect(await (await get(api, `${spa.url}deep/link`)).text()).toBe("<p>home</p>");
    expect((await get(api, `${spa.url}deep/link/`)).status).toBe(200);
    expect((await get(api, `${spa.url}missing.js`)).status).toBe(404);
    expect((await get(api, `${spa.url}app.js`)).status).toBe(200);

    const off = await api.call("PATCH", "/v1/previews/app", { body: { spa: false } });
    expect(((await off.json()) as { spa: boolean }).spa).toBe(false);
    expect((await get(api, `${spa.url}deep/link`)).status).toBe(404);
  });

  test("private previews need a share link or owner ticket and stay revocable (H9-A3)", async () => {
    const api = make();
    const out = await deploy(
      api,
      "vault",
      { "index.html": "<h1>secret</h1>" },
      "visibility=private",
    );
    expect((await get(api, out.url)).status).toBe(404);

    const created = CreatedLink.parse(
      await (await api.call("POST", "/v1/previews/vault/links", { body: {} })).json(),
    );
    const redeemed = await get(api, created.url);
    expect(redeemed.status).toBe(302);
    const location = redeemed.headers.get("location") ?? "";
    expect(location).not.toContain("sl_");

    let page: Response;
    if (mode === "path") {
      page = await get(api, new URL(location, out.url).href);
    } else {
      expect(location).toBe("/");
      const cookie = redeemed.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("hp_cap=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).not.toContain("Domain");
      page = await get(api, out.url, { cookie: cookie.split(";")[0] ?? "" });
      expect((await get(api, out.url)).status).toBe(404);
    }
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("private, no-store");
    expect(await page.text()).toContain("secret");

    const id = api.ctx.deps.previews.findByName("vault")?.id ?? "";
    const ticket = mintTicket(api.ctx.deps.signingSecret, id, api.ctx.deps.clock.now());
    const owner = await get(api, `${out.url}~${ticket}/`);
    expect(owner.status).toBe(302);

    await api.call("DELETE", `/v1/previews/vault/links/${created.id}`);
    const revoked =
      mode === "path"
        ? await get(api, new URL(location, out.url).href)
        : await get(api, out.url, {
            cookie: (redeemed.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
          });
    expect(revoked.status).toBe(404);
  });

  test("a capability cookie from one private preview opens no other (H9-A3)", async () => {
    if (mode === "path") return;
    const api = make();
    const a = await deploy(api, "one", { "index.html": "a" }, "visibility=private");
    const b = await deploy(api, "two", { "index.html": "b" }, "visibility=private");
    const link = CreatedLink.parse(
      await (await api.call("POST", "/v1/previews/one/links", { body: {} })).json(),
    );
    const cookie = ((await get(api, link.url)).headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    expect((await get(api, a.url, { cookie })).status).toBe(200);
    expect((await get(api, b.url, { cookie })).status).toBe(404);
  });
});
