// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { DeployResponse, ErrorBody, FileListing, PreviewDetail } from "@html-preview/shared";
import { URL_BASE, useCli } from "./test-support";

const make = useCli({ MAX_VISIBILITY: "public" });

function seedSite(h: ReturnType<typeof make>): void {
  h.write("site/index.html", '<h1>hi</h1><link rel="stylesheet" href="app.css">');
  h.write("site/app.css", "body{margin:0}");
  h.write("site/img/logo.svg", "<svg/>");
}

describe("login (H6-A1)", () => {
  test("verifies the key, stores config with mode 0600 and then works without env", async () => {
    const h = make();
    h.rt.env = {};
    expect(await h.run("login", "--url", `${URL_BASE}/`, "--key", h.api.key, "--json")).toBe(0);
    const file = join(h.rt.configDir, "config.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(await Bun.file(file).json()).toEqual({ url: URL_BASE, key: h.api.key });
    expect(await h.run("list", "--json")).toBe(0);
  });

  test("a rejected key is not stored (exit 2)", async () => {
    const h = make();
    h.rt.env = {};
    expect(await h.run("login", "--url", URL_BASE, "--key", "hp_nope", "--json")).toBe(2);
    expect(existsSync(join(h.rt.configDir, "config.json"))).toBe(false);
  });

  test("env vars override the stored file and flags override env", async () => {
    const h = make();
    await h.run("login", "--url", URL_BASE, "--key", h.api.key);
    h.rt.env = { HTML_PREVIEW_KEY: "hp_wrong" };
    expect(await h.run("list", "--json")).toBe(2);
    expect(await h.run("list", "--json", "--key", h.api.key)).toBe(0);
  });

  test("without credentials: usage error NOT_LOGGED_IN (exit 1)", async () => {
    const h = make();
    h.rt.env = {};
    expect(await h.run("list", "--json")).toBe(1);
    expect(ErrorBody.parse(h.json()).error.code).toBe("NOT_LOGGED_IN");
  });
});

describe("deploy (H6-A2)", () => {
  test("uploads only missing blobs: 3, then 0, then 1 after touching one file", async () => {
    const h = make();
    seedSite(h);
    expect(await h.run("deploy", "site", "--json")).toBe(0);
    const first = DeployResponse.parse(h.json());
    expect(first).toMatchObject({ name: "site", created: true, files: 3, uploaded: 3 });
    expect(await (await h.api.content(new URL(first.url).pathname)).text()).toContain(
      "<h1>hi</h1>",
    );

    expect(await h.run("deploy", "site", "--json")).toBe(0);
    expect(DeployResponse.parse(h.json())).toMatchObject({ created: false, uploaded: 0 });

    h.write("site/app.css", "body{margin:1px}");
    expect(await h.run("deploy", "site", "--json")).toBe(0);
    expect(DeployResponse.parse(h.json()).uploaded).toBe(1);
  });

  test("--json prints exactly the API response on stdout", async () => {
    const h = make();
    seedSite(h);
    await h.run("deploy", "site", "--json");
    expect(h.stdout).toHaveLength(1);
    expect(Object.keys(h.json()).sort()).toEqual([
      "bytes",
      "created",
      "deploymentId",
      "deploymentUrl",
      "expiresAt",
      "files",
      "name",
      "uploaded",
      "url",
      "warnings",
    ]);
  });

  test("name defaults to the slugified folder or file name; --name overrides", async () => {
    const h = make();
    h.write("My Site_v2/index.html", "<p>a</p>");
    await h.run("deploy", "My Site_v2", "--json");
    expect(h.json()).toMatchObject({ name: "my-site-v2" });
    h.write("Landing Page.html", "<p>b</p>");
    await h.run("deploy", "Landing Page.html", "--json");
    expect(h.json()).toMatchObject({ name: "landing-page" });
    await h.run("deploy", "Landing Page.html", "--name", "custom", "--json");
    expect(h.json()).toMatchObject({ name: "custom" });
  });

  test("a single html file is served as the entry page", async () => {
    const h = make();
    h.write("page.html", "<p>solo</p>");
    await h.run("deploy", "page.html", "--json");
    const { url } = DeployResponse.parse(h.json());
    expect(await (await h.api.content(new URL(url).pathname)).text()).toBe("<p>solo</p>");
  });

  test("--ttl, --visibility, --entry, --message and --pinned reach the server", async () => {
    const h = make();
    h.write("s/index.html", "<p>x</p>");
    h.write("s/other.html", "<p>y</p>");
    await h.run(
      "deploy",
      "s",
      "--ttl",
      "5",
      "--visibility",
      "public",
      "--entry",
      "other.html",
      "-m",
      "first",
      "--json",
    );
    expect(h.json()).toMatchObject({ expiresAt: "2026-01-01T05:00:00.000Z" });
    await h.run("info", "s", "--json");
    const detail = PreviewDetail.parse(h.json());
    expect(detail.preview.visibility).toBe("public");
    expect(detail.deployments[0]).toMatchObject({ entry: "other.html", message: "first" });

    await h.run("deploy", "s", "--pinned", "--json");
    await h.run("info", "s", "--json");
    expect(PreviewDetail.parse(h.json()).preview.pinned).toBe(true);
  });

  test("human output names the URL, counts and warnings", async () => {
    const h = make();
    h.write("w/index.html", '<script src="/app.js"></script>');
    h.write("w/app.css", "body{background:url(/bg.png)}");
    expect(await h.run("deploy", "w")).toBe(0);
    const text = h.stdout.join("");
    expect(text).toContain("Created w: http://");
    expect(text).toContain("2 files");
    expect(text).toContain("warning ROOT_RELATIVE_URL");
  });
});

describe("ignore rules (H6-A3)", () => {
  test("never uploads dotfiles or node_modules; .previewignore is honored", async () => {
    const h = make();
    h.write("p/index.html", "<p>ok</p>");
    h.write("p/.env", "SECRET=1");
    h.write("p/.git/config", "x");
    h.write("p/node_modules/dep/index.js", "x");
    h.write("p/src/node_modules/dep.js", "x");
    h.write("p/notes.md", "private");
    h.write("p/drafts/a.html", "x");
    h.write("p/keep/b.html", "x");
    h.write("p/keep/skip.map", "x");
    h.write("p/.previewignore", "*.md\n/drafts/\n*.map\n");
    expect(await h.run("deploy", "p", "--json")).toBe(0);
    await h.run("info", "p", "--json");
    const { deployments } = PreviewDetail.parse(h.json());
    const res = await h.api.call("GET", `/v1/previews/p/files?deployment=${deployments[0]?.id}`);
    const listing = FileListing.parse(await res.json());
    expect(Object.keys(listing.files).sort()).toEqual(["index.html", "keep/b.html"]);
  });

  test("a folder with nothing deployable is a usage error (exit 1)", async () => {
    const h = make();
    h.write("e/.hidden", "x");
    expect(await h.run("deploy", "e", "--json")).toBe(1);
    expect(h.json()).toMatchObject({ error: { code: "NO_FILES" } });
  });
});

describe("exit codes and --json errors (H6-A4)", () => {
  test("usage errors → 1", async () => {
    const h = make();
    expect(await h.run("deploy")).toBe(1);
    expect(await h.run("nope")).toBe(1);
    expect(await h.run("deploy", "x", "--bogus")).toBe(1);
    expect(await h.run("deploy", "x", "--ttl", "abc")).toBe(1);
    expect(await h.run("deploy", "x", "--visibility", "secret")).toBe(1);
    expect(await h.run("deploy", "missing-dir", "--json")).toBe(1);
    expect(await h.run()).toBe(1);
    expect(h.stderr.join("")).toContain("fix:");
  });

  test("API errors → 2 and --json prints the server's error body verbatim", async () => {
    const h = make();
    expect(await h.run("info", "ghost", "--json")).toBe(2);
    const body = ErrorBody.parse(h.json());
    expect(body.error.code).toBe("PREVIEW_NOT_FOUND");
    expect(h.stderr).toEqual([]);
    expect(await h.run("info", "ghost")).toBe(2);
    expect(h.stderr.join("")).toContain("error:");
  });

  test("network failures → 3", async () => {
    const h = make();
    h.rt.fetch = () => Promise.reject(new TypeError("connect ECONNREFUSED"));
    expect(await h.run("list", "--json")).toBe(3);
    expect(h.json()).toMatchObject({ error: { code: "NETWORK_ERROR" } });
  });

  test("--help and --version exit 0", async () => {
    const h = make();
    expect(await h.run("--help")).toBe(0);
    expect(h.stdout.join("")).toContain("Exit codes");
    expect(await h.run("--version")).toBe(0);
    expect(h.stdout.at(-1)).toBe("0.0.0-test\n");
  });
});

describe("manage commands (H6-A1)", () => {
  test("list, info, open, rollback and rm", async () => {
    const h = make();
    h.write("m/index.html", "<p>v1</p>");
    await h.run("deploy", "m", "-m", "one", "--json");
    const v1 = DeployResponse.parse(h.json());
    h.write("m/index.html", "<p>v2</p>");
    await h.run("deploy", "m", "--json");

    await h.run("list", "--json");
    expect((h.json() as { previews: unknown[] }).previews).toHaveLength(1);
    await h.run("list", "--query", "zzz", "--json");
    expect((h.json() as { previews: unknown[] }).previews).toHaveLength(0);
    expect(await h.run("list")).toBe(0);

    expect(await h.run("open", "m")).toBe(0);
    expect(h.opened).toHaveLength(1);
    expect(await h.run("open", "m", "--json")).toBe(0);
    expect(h.opened).toHaveLength(1);

    expect(await h.run("rollback", "m", "--to", v1.deploymentId, "--json")).toBe(0);
    expect(await (await h.api.content(new URL(v1.url).pathname)).text()).toBe("<p>v1</p>");
    await h.run("rollback", "m", "--json");
    expect(await h.run("rollback", "m", "--to", "nope", "--json")).toBe(2);

    expect(await h.run("rm", "m", "--json")).toBe(0);
    expect(h.json()).toEqual({ deleted: "m" });
    expect(await h.run("info", "m", "--json")).toBe(2);
  });
});

describe("rate limiting", () => {
  test("429 is retried after Retry-After, then succeeds", async () => {
    let first = true;
    const h = useCli({}, (inner) => async (input, init) => {
      if (first) {
        first = false;
        return new Response("{}", { status: 429, headers: { "retry-after": "2" } });
      }
      return inner(input, init);
    })();
    expect(await h.run("list", "--json")).toBe(0);
    expect(h.sleeps).toEqual([2000]);
  });
});

describe("share (H7-A5)", () => {
  test("creates, lists and revokes share links of a private preview", async () => {
    const h = make();
    h.write("s/index.html", "<p>secret</p>");
    await h.run("deploy", "s", "--visibility", "private", "--json");
    expect(await h.run("share", "s", "--expires", "2", "--label", "qa", "--json")).toBe(0);
    const created = h.json() as { id: string; url: string; label: string };
    expect(created.label).toBe("qa");
    expect(created.url).toContain("/~sl_");

    await h.run("share", "s", "--list", "--json");
    expect((h.json() as { links: { id: string }[] }).links.map((link) => link.id)).toEqual([
      created.id,
    ]);

    expect(await h.run("share", "s", "--revoke", created.id, "--json")).toBe(0);
    expect(await h.run("share", "s", "--revoke", "l_unknown", "--json")).toBe(2);
    expect(h.json()).toMatchObject({ error: { code: "LINK_NOT_FOUND" } });
  });

  test("a public preview cannot be shared: PREVIEW_NOT_PRIVATE (exit 2)", async () => {
    const h = make();
    h.write("o/index.html", "<p>x</p>");
    await h.run("deploy", "o", "--json");
    expect(await h.run("share", "o", "--json")).toBe(2);
    expect(h.json()).toMatchObject({ error: { code: "PREVIEW_NOT_PRIVATE" } });
  });
});
