// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import { useApi } from "./test-support/api";
import {
  PASSWORD,
  deploy,
  form,
  makeDashboard,
  signIn,
  signedIn,
  tokenOf,
} from "./test-support/dashboard";

const make = makeDashboard();

describe("previews list and favicon (H7-A2, H7-A3)", () => {
  test("lists previews with the documented columns; filters by name and key; empty state", async () => {
    const api = make();
    const s = await signedIn(api);
    const empty = await (await s.get("/dashboard")).text();
    expect(empty).toContain("No previews yet");
    expect(empty).toContain("npx live-pages deploy");

    await deploy(api, "alpha-site", { "index.html": "<p>a</p>" });
    await deploy(api, "beta-site", { "index.html": "<p>b</p>" }, "?visibility=private");
    const html = await (await s.get("/dashboard")).text();
    for (const text of ["alpha-site", "beta-site", "private", "tester", "Expires", "Size"]) {
      expect(html).toContain(text);
    }
    const byName = await (await s.get("/dashboard?q=alpha")).text();
    expect(byName).toContain("alpha-site");
    expect(byName).not.toContain("beta-site");
    const byKey = await (await s.get("/dashboard?by=nobody")).text();
    expect(byKey).toContain("No previews match");
    expect(await (await s.get("/dashboard?by=tester")).text()).toContain("beta-site");
  });

  test("favicon: link rel=icon file, data: URI, favicon.* fallback; never remote, never > 256 KB", async () => {
    const api = make();
    const s = await signedIn(api);
    await deploy(api, "from-link", {
      "index.html": '<head><link rel="shortcut icon" href="img/i.png"></head>',
      "img/i.png": "PNGDATA",
    });
    await deploy(api, "from-data", {
      "index.html": '<link rel="icon" href="data:image/svg+xml;base64,PHN2Zy8+">',
    });
    await deploy(api, "fallback", { "index.html": "<p>x</p>", "favicon.ico": "ICO" });
    await deploy(api, "remote", {
      "index.html": '<link rel="icon" href="https://evil.example/x.png">',
    });
    await deploy(api, "huge", {
      "index.html": '<link rel="icon" href="big.png">',
      "big.png": "x".repeat(256 * 1024 + 1),
    });
    await deploy(api, "escape", {
      "index.html": '<link rel="icon" href="../../etc/passwd.png">',
    });

    const html = await (await s.get("/dashboard")).text();
    for (const name of ["from-link", "from-data", "fallback"]) {
      expect(html).toContain(`/dashboard/previews/${name}/favicon`);
    }
    for (const name of ["remote", "huge", "escape"]) {
      expect(html).not.toContain(`/dashboard/previews/${name}/favicon`);
    }
    const icon = await s.get("/dashboard/previews/from-link/favicon");
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toBe("image/png");
    expect(icon.headers.get("content-security-policy")).toContain("sandbox");
    expect(await icon.text()).toBe("PNGDATA");
    const data = await s.get("/dashboard/previews/from-data/favicon");
    expect(data.headers.get("content-type")).toBe("image/svg+xml");
    expect((await s.get("/dashboard/previews/remote/favicon")).status).toBe(404);
  });
});

describe("preview detail (H7-A2)", () => {
  test("iframe is sandboxed without same-origin; private previews open via a ticket", async () => {
    const api = make();
    const s = await signedIn(api);
    const open = await deploy(api, "pub", { "index.html": "<p>public</p>" });
    const detail = await (await s.get("/dashboard/previews/pub")).text();
    expect(detail).toContain("<iframe");
    expect(detail).toContain('sandbox="allow-scripts allow-forms allow-popups allow-modals"');
    expect(detail).not.toContain("allow-same-origin");
    expect(detail).toContain(`src="${open.url}"`);

    const secret = await deploy(
      api,
      "hush",
      { "index.html": "<p>hush</p>" },
      "?visibility=private",
    );
    const page = await (await s.get("/dashboard/previews/hush")).text();
    const src = /<iframe[^>]*src="([^"]+)"/.exec(page)?.[1] ?? "";
    expect(src).toMatch(/\/~[^/]+\/$/);
    const viaTicket = await api.content(new URL(src).pathname);
    expect(viaTicket.status).toBe(302);
    expect((await api.content(viaTicket.headers.get("location") ?? "")).status).toBe(200);
    expect((await api.content(new URL(secret.url).pathname)).status).toBe(404);

    const redirect = await s.get("/dashboard/previews/hush/open");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toMatch(/\/~[^/]+\/$/);
    const missing = await s.get("/dashboard/previews/hush/open?deployment=d_nope");
    expect(missing.status).toBe(404);
  });

  test("settings, rollback, share links and delete work through forms", async () => {
    const api = make();
    const s = await signedIn(api);
    const first = await deploy(api, "site", { "index.html": "<p>v1</p>" });
    await deploy(api, "site", { "index.html": "<p>v2</p>" });

    const settings = await s.post("/dashboard/previews/site/settings", {
      visibility: "private",
      ttl: "5",
      pinned: "1",
    });
    expect(settings.status).toBe(200);
    expect(await settings.text()).toContain("Settings saved");
    const stored = api.ctx.deps.previews.findByName("site");
    expect(stored).toMatchObject({ visibility: "private", pinned: true });

    const rolled = await s.post("/dashboard/previews/site/rollback", {
      deploymentId: first.deploymentId,
    });
    expect(await rolled.text()).toContain("Rolled back");
    expect(api.ctx.deps.previews.findByName("site")?.currentDeploymentId).toBe(first.deploymentId);

    const created = await s.post("/dashboard/previews/site/links", {
      label: "qa team",
      expiresInHours: "24",
    });
    expect(created.status).toBe(201);
    const html = await created.text();
    const url = /<code id="new-link">([^<]+)<\/code>/.exec(html)?.[1] ?? "";
    expect(url).toContain("/~sl_");
    const reload = await (await s.get("/dashboard/previews/site")).text();
    expect(reload).not.toContain("sl_");
    expect(reload).toContain("qa team");
    expect((await api.content(new URL(url).pathname)).status).toBe(302);

    const linkId = api.ctx.deps.links.listByPreview(stored?.id ?? "")[0]?.id ?? "";
    const revoked = await s.post(`/dashboard/previews/site/links/${linkId}/revoke`);
    expect(await revoked.text()).toContain("Link revoked");
    expect((await api.content(new URL(url).pathname)).status).toBe(404);

    const gone = await s.post("/dashboard/previews/site/delete");
    expect(gone.status).toBe(303);
    expect(api.ctx.deps.previews.findByName("site")).toBeNull();
    expect((await s.get("/dashboard/previews/site")).status).toBe(404);
  });

  test("destructive actions use an accessible modal, never confirm()", async () => {
    const api = make();
    const s = await signedIn(api);
    await deploy(api, "site", { "index.html": "<p>x</p>" });
    const html = await (await s.get("/dashboard/previews/site")).text();
    expect(html).toContain('id="delete-preview"');
    expect(html).toContain("aria-modal");
    expect(html).toContain("This cannot be undone");
    expect(html).not.toContain("confirm(");
    const script = await api.call("GET", "/dashboard/assets/dashboard.js", { key: null });
    expect(await script.text()).not.toContain("confirm(");
  });

  test("share links are offered only for private previews; errors render in the page", async () => {
    const api = make();
    const s = await signedIn(api);
    await deploy(api, "open-one", { "index.html": "<p>x</p>" });
    const html = await (await s.get("/dashboard/previews/open-one")).text();
    expect(html).toContain("Share links are for private previews");
    const refused = await s.post("/dashboard/previews/open-one/links", { expiresInHours: "5" });
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain("not private");
  });

  test("user-supplied text is escaped", async () => {
    const api = make();
    const s = await signedIn(api);
    await deploy(api, "esc", { "index.html": "<p>x</p>" }, "?visibility=private");
    const created = await s.post("/dashboard/previews/esc/links", {
      label: "<script>alert(1)</script>",
      expiresInHours: "5",
    });
    const html = await created.text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("API keys and usage pages (H7-A2)", () => {
  test("create shows the token once; revoke works; the last admin cannot be revoked", async () => {
    const api = make();
    const s = await signedIn(api);
    const created = await s.post("/dashboard/keys", {
      label: "ci-bot",
      scopes: ["read", "deploy"],
    });
    expect(created.status).toBe(201);
    const token = /<code id="new-key">(hp_[^<]+)<\/code>/.exec(await created.text())?.[1] ?? "";
    expect(token).toStartWith("hp_");
    expect((await api.call("GET", "/v1/previews", { key: token })).status).toBe(200);
    const reload = await (await s.get("/dashboard/keys")).text();
    expect(reload).not.toContain(token);
    expect(reload).toContain("ci-bot");

    const invalid = await s.post("/dashboard/keys", { label: "", scopes: [] });
    expect(invalid.status).toBe(400);

    const ciId = api.ctx.deps.keys.list().find((key) => key.label === "ci-bot")?.id ?? "";
    expect((await s.post(`/dashboard/keys/${ciId}/revoke`)).status).toBe(303);
    expect((await api.call("GET", "/v1/previews", { key: token })).status).toBe(401);

    const adminId = api.ctx.deps.keys.list().find((key) => key.label === "tester")?.id ?? "";
    const last = await s.post(`/dashboard/keys/${adminId}/revoke`);
    expect(last.status).toBe(409);
    expect(await last.text()).toContain("last admin key");
  });

  test("usage shows totals and quota", async () => {
    const api = make();
    const s = await signedIn(api);
    await deploy(api, "u", { "index.html": "<p>x</p>" });
    const html = await (await s.get("/dashboard/usage")).text();
    expect(html).toContain("Previews");
    expect(html).toContain("Instance cap");
    expect(html).toContain("tester");
  });
});
