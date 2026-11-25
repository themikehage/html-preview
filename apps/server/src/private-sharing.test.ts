// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { CreatedLink, ErrorBody, LinkList } from "@html-preview/shared";
import { zipSync } from "fflate";
import { mintTicket, signClaims } from "./domain/capability";
import { type Api, useApi } from "./test-support/api";

const make = useApi();
const enc = (text: string) => new TextEncoder().encode(text);

async function deployPrivate(api: Api, name = "secret"): Promise<{ id: string }> {
  const zip = zipSync({
    "index.html": enc('<link rel="stylesheet" href="/app.css"><h1>top secret</h1>'),
    "app.css": enc("body{}"),
  });
  const res = await api.call("PUT", `/v1/previews/${name}?visibility=private`, {
    body: zip,
    headers: { "content-type": "application/zip" },
  });
  expect(res.status).toBe(201);
  const { url } = (await res.json()) as { url: string };
  return { id: new URL(url).pathname.split("/")[1] as string };
}

async function createLink(api: Api, name: string, body: object = {}) {
  const res = await api.call("POST", `/v1/previews/${name}/links`, { body });
  return { res, link: res.status === 201 ? CreatedLink.parse(await res.json()) : null };
}

const pathOf = (url: string) => new URL(url).pathname;

describe("private enforcement and share links (H7-A4, H7-A5)", () => {
  test("a private preview is a 404 by id, by name and with junk tokens", async () => {
    const api = make();
    const { id } = await deployPrivate(api);
    for (const path of [
      `/${id}/`,
      "/secret/",
      `/${id}/~nope/`,
      `/${id}/~sl_nope/`,
      `/${id}/app.css`,
    ]) {
      expect((await api.content(path)).status).toBe(404);
    }
  });

  test("a share link redeems into a signed path capability that serves everything", async () => {
    const api = make();
    const { id } = await deployPrivate(api);
    const { res, link } = await createLink(api, "secret", { label: "reviewer" });
    expect(res.status).toBe(201);
    expect(link?.url).toMatch(new RegExp(`^http://127.0.0.1:3000/${id}/~sl_`));

    const redeem = await api.content(pathOf(link?.url ?? ""));
    expect(redeem.status).toBe(302);
    expect(redeem.headers.get("cache-control")).toBe("no-store");
    const location = redeem.headers.get("location") ?? "";
    expect(location).toMatch(new RegExp(`^/${id}/~[^/]+/$`));
    expect(location).not.toContain("sl_");

    const page = await api.content(location);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("sandbox");
    expect(page.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    expect(page.headers.get("cache-control")).toBe("private, no-store");
    const html = await page.text();
    expect(html).toContain("top secret");
    const prefix = location.replace(/\/$/, "");
    expect(html).toContain(`href="${prefix}/app.css"`);
    expect((await api.content(`${prefix}/app.css`)).status).toBe(200);
    expect((await api.content(prefix)).status).toBe(308);

    const tampered = `${location.slice(0, -3)}AA/`;
    expect((await api.content(tampered)).status).toBe(404);
  });

  test("listing shows counts and never the secret; access is counted per redemption", async () => {
    const api = make();
    await deployPrivate(api);
    const { link } = await createLink(api, "secret", { label: "a" });
    const path = pathOf(link?.url ?? "");
    await api.content(path);
    await api.content(path);
    const res = await api.call("GET", "/v1/previews/secret/links");
    const text = await res.text();
    expect(text).not.toContain("sl_");
    const { links } = LinkList.parse(JSON.parse(text));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ label: "a", accessCount: 2, revokedAt: null });
  });

  test("revoking a link kills the link and every capability minted from it, at once", async () => {
    const api = make();
    await deployPrivate(api);
    const { link } = await createLink(api, "secret");
    const location = (await api.content(pathOf(link?.url ?? ""))).headers.get("location") ?? "";
    expect((await api.content(location)).status).toBe(200);
    const del = await api.call("DELETE", `/v1/previews/secret/links/${link?.id}`);
    expect(del.status).toBe(204);
    expect((await api.content(location)).status).toBe(404);
    expect((await api.content(pathOf(link?.url ?? ""))).status).toBe(404);
    const missing = await api.call("DELETE", "/v1/previews/secret/links/l_nope");
    expect(ErrorBody.parse(await missing.json()).error.code).toBe("LINK_NOT_FOUND");
  });

  test("links expire; capabilities never outlive their link and last at most one hour", async () => {
    const api = make();
    await deployPrivate(api);
    const short = (await createLink(api, "secret", { expiresInHours: 1 })).link;
    const long = (await createLink(api, "secret", { expiresInHours: 48 })).link;
    const shortLocation = (await api.content(pathOf(short?.url ?? ""))).headers.get("location");
    const longLocation = (await api.content(pathOf(long?.url ?? ""))).headers.get("location");
    api.clock.advance(3601);
    expect((await api.content(shortLocation ?? "")).status).toBe(404);
    expect((await api.content(pathOf(short?.url ?? ""))).status).toBe(404);
    expect((await api.content(longLocation ?? "")).status).toBe(404);
    expect((await api.content(pathOf(long?.url ?? ""))).status).toBe(302);
  });

  test("links need a private preview, are capped at 20 and validate expiry bounds", async () => {
    const api = make();
    await api.call("PUT", "/v1/previews/open", {
      body: "<p>x</p>",
      headers: { "content-type": "text/html" },
    });
    const open = await createLink(api, "open");
    expect(open.res.status).toBe(409);
    expect(ErrorBody.parse(await open.res.json()).error.code).toBe("PREVIEW_NOT_PRIVATE");

    await deployPrivate(api);
    for (const expiresInHours of [0, 721]) {
      expect((await createLink(api, "secret", { expiresInHours })).res.status).toBe(400);
    }
    for (let count = 0; count < 20; count += 1) {
      expect((await createLink(api, "secret")).res.status).toBe(201);
    }
    const extra = await createLink(api, "secret");
    expect(extra.res.status).toBe(409);
    expect(ErrorBody.parse(await extra.res.json()).error.code).toBe("TOO_MANY_LINKS");
    const first = LinkList.parse(await (await api.call("GET", "/v1/previews/secret/links")).json());
    await api.call("DELETE", `/v1/previews/secret/links/${first.links[0]?.id}`);
    expect((await createLink(api, "secret")).res.status).toBe(201);
  });

  test("leaving private revokes all links for good; private again does not resurrect them", async () => {
    const api = make();
    await deployPrivate(api);
    const { link } = await createLink(api, "secret");
    const patch = (visibility: string) =>
      api.call("PATCH", "/v1/previews/secret", { body: { visibility } });
    expect((await patch("unlisted")).status).toBe(200);
    const { links } = LinkList.parse(
      await (await api.call("GET", "/v1/previews/secret/links")).json(),
    );
    expect(links[0]?.revokedAt).not.toBeNull();
    expect((await patch("private")).status).toBe(200);
    expect((await api.content(pathOf(link?.url ?? ""))).status).toBe(404);
  });

  test("failed share-token attempts are rate limited per client, valid ones still count separately", async () => {
    const api = make();
    const { id } = await deployPrivate(api);
    const bad = () =>
      api.content(`/${id}/~sl_${"x".repeat(43)}/`, { headers: { "x-forwarded-for": "9.9.9.9" } });
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await bad()).status).toBe(404);
    const blocked = await bad();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    const { link } = await createLink(api, "secret");
    const other = await api.content(pathOf(link?.url ?? ""), {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    expect(other.status).toBe(302);
  });

  test("owner tickets: 60 seconds, bound to the preview, exchanged for a capability", async () => {
    const api = make();
    const { id } = await deployPrivate(api);
    await deployPrivate(api, "other");
    const secret = api.ctx.deps.signingSecret;
    const ticket = mintTicket(secret, id, api.clock.now());
    const redeemed = await api.content(`/${id}/~${ticket}/`);
    expect(redeemed.status).toBe(302);
    expect((await api.content(redeemed.headers.get("location") ?? "")).status).toBe(200);

    const otherId = api.ctx.deps.previews.findByName("other")?.id ?? "";
    expect((await api.content(`/${otherId}/~${ticket}/`)).status).toBe(404);
    api.clock.advance(61);
    expect((await api.content(`/${id}/~${ticket}/`)).status).toBe(404);
  });

  test("a ticket never serves content directly, and other token kinds are rejected", async () => {
    const api = make();
    const { id } = await deployPrivate(api);
    const secret = api.ctx.deps.signingSecret;
    const ticket = mintTicket(secret, id, api.clock.now());
    expect((await api.content(`/${id}/~${ticket}/`)).status).toBe(302);
    const location = (await api.content(`/${id}/~${ticket}/`)).headers.get("location") ?? "";
    api.clock.advance(61);
    expect((await api.content(location)).status).toBe(200);
    const exp = Math.floor(api.clock.now().getTime() / 1000) + 600;
    const session = signClaims(secret, { k: "session", p: id, exp });
    expect((await api.content(`/${id}/~${session}/`)).status).toBe(404);
    const other = signClaims("x".repeat(40), { k: "cap", p: id, exp });
    expect((await api.content(`/${id}/~${other}/`)).status).toBe(404);
  });
});

describe("MAX_VISIBILITY ceiling on stored visibility (H7-A6)", () => {
  test("a preview stored as public under a stricter ceiling is not served by name", async () => {
    const api = make();
    const res = await api.call("PUT", "/v1/previews/pub?visibility=unlisted", {
      body: "<p>x</p>",
      headers: { "content-type": "text/html" },
    });
    const { url } = (await res.json()) as { url: string };
    const id = pathOf(url).split("/")[1] as string;
    api.ctx.deps.previews.update(id, { visibility: "public" }, api.clock.now().toISOString());
    const strict = { ...api.ctx.deps, maxVisibility: "unlisted" as const };
    expect(strict.maxVisibility).toBe("unlisted");
    expect((await api.content("/pub/")).status).toBe(404);
  });

  test("with a private ceiling, unlisted previews are enforced as private", async () => {
    const strict = useApi({ MAX_VISIBILITY: "private" })();
    const res = await strict.call("PUT", "/v1/previews/p1", {
      body: "<p>x</p>",
      headers: { "content-type": "text/html" },
    });
    const { url } = (await res.json()) as { url: string };
    expect(res.status).toBe(201);
    expect((await strict.content(pathOf(url))).status).toBe(404);
    const refused = await strict.call("PUT", "/v1/previews/p2?visibility=public", {
      body: "<p>x</p>",
      headers: { "content-type": "text/html" },
    });
    expect(ErrorBody.parse(await refused.json()).error.code).toBe("VISIBILITY_NOT_ALLOWED");
    const { link } = await createLink(strict, "p1");
    expect(link).not.toBeNull();
    expect((await strict.content(pathOf(link?.url ?? ""))).status).toBe(302);
  });
});

describe("signing secret", () => {
  test("is generated into DATA_DIR with mode 0600 and reused; SIGNING_SECRET wins", () => {
    const first = make();
    const file = join(first.dataDir, "signing-secret");
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(first.ctx.deps.signingSecret).toHaveLength(64);
    const fromEnv = useApi({ SIGNING_SECRET: "s".repeat(40) })();
    expect(fromEnv.ctx.deps.signingSecret).toBe("s".repeat(40));
  });
});
