// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { DeployResponse } from "@html-preview/shared";
import { zipSync } from "fflate";
import { type Api, useApi } from "../test-support/api";

const make = useApi();
const enc = (text: string) => new TextEncoder().encode(text);

async function deployZip(
  api: Api,
  files: Record<string, string | Uint8Array>,
  query = "",
  name = "site",
): Promise<DeployResponse> {
  const entries = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [
      path,
      typeof content === "string" ? enc(content) : content,
    ]),
  );
  const res = await api.call("PUT", `/v1/previews/${name}${query}`, {
    body: zipSync(entries),
    headers: { "content-type": "application/zip" },
  });
  expect(res.status).toBeLessThan(300);
  return DeployResponse.parse(await res.json());
}

const codes = (response: DeployResponse): string[] =>
  response.warnings.map((warning) => `${warning.code}:${warning.file ?? ""}`);

describe("deploy warnings (H4-A6)", () => {
  test("a clean site has no warnings", async () => {
    const api = make();
    const res = await deployZip(api, {
      "index.html": '<link rel="stylesheet" href="app.css"><script src="app.js"></script>',
      "app.css": "body { background: url(img/bg.png) }",
      "app.js": 'fetch("data.json"); const re = /a\\/b/; const text = "a/b";',
    });
    expect(res.warnings).toEqual([]);
  });

  test("ROOT_RELATIVE_URL in JS and CSS carries file and fix; HTML attributes are rewritten, not warned", async () => {
    const api = make();
    const res = await deployZip(api, {
      "index.html": '<script src="/assets/app.js"></script><a href="/about">x</a>',
      "assets/app.js": 'import("/assets/chunk-1.js"); fetch("/api/items");',
      "assets/app.css": '@font-face { src: url("/fonts/a.woff2") }',
    });
    expect(codes(res)).toEqual([
      "ROOT_RELATIVE_URL:assets/app.css",
      "ROOT_RELATIVE_URL:assets/app.js",
    ]);
    const [warning] = res.warnings;
    expect(warning?.fix).toContain("relative");
  });

  test("protocol-relative and absolute URLs are not root-relative", async () => {
    const api = make();
    const res = await deployZip(api, {
      "index.html": "<p>x</p>",
      "app.js": 'load("//cdn.example.com/a.js"); load("https://cdn.example.com/a.js");',
      "app.css": "a { background: url(//cdn.example.com/a.png) }",
    });
    expect(res.warnings).toEqual([]);
  });

  test("LOCALHOST_URL in html, js and css", async () => {
    const api = make();
    const res = await deployZip(api, {
      "index.html": '<img src="http://localhost:5173/logo.png">',
      "app.js": 'fetch("http://127.0.0.1:8080/api")',
      "app.css": "a { background: url(http://0.0.0.0:3000/x.png) }",
    });
    expect(
      codes(res)
        .filter((item) => item.startsWith("LOCALHOST_URL"))
        .sort(),
    ).toEqual(["LOCALHOST_URL:app.css", "LOCALHOST_URL:app.js", "LOCALHOST_URL:index.html"]);
    expect(res.warnings.some((warning) => warning.code === "MIXED_CONTENT")).toBe(false);
  });

  test("MIXED_CONTENT for http:// subresources, not for plain links or https", async () => {
    const api = make();
    const res = await deployZip(api, {
      "index.html":
        '<a href="http://example.com">link</a><img src="https://ok.example.com/a.png">' +
        '<script src="http://cdn.example.com/lib.js"></script>',
      "style.css": '@import "http://fonts.example.com/f.css";',
    });
    expect(codes(res)).toEqual(["MIXED_CONTENT:index.html", "MIXED_CONTENT:style.css"]);
    const clean = await deployZip(
      api,
      {
        "index.html":
          '<a href="http://example.com">link</a><svg xmlns="http://www.w3.org/2000/svg"></svg>',
      },
      "",
      "plain",
    );
    expect(clean.warnings).toEqual([]);
  });

  test("LARGE_FILE above 5 MB", async () => {
    const api = make();
    const res = await deployZip(api, {
      "index.html": "<p>x</p>",
      "video.bin": new Uint8Array(5 * 1_048_576 + 1),
    });
    expect(codes(res)).toEqual(["LARGE_FILE:video.bin"]);
  });

  test("NO_ENTRY_HTML when the entry is not an html page", async () => {
    const api = make();
    const res = await deployZip(
      api,
      { "index.html": "<p>x</p>", "notes.txt": "hello" },
      "?entry=notes.txt",
    );
    expect(codes(res)).toEqual(["NO_ENTRY_HTML:notes.txt"]);
  });

  test("manifest-flow finalize reports the same warnings", async () => {
    const api = make();
    const content = 'fetch("/api/data.json")';
    const hash = new Bun.CryptoHasher("sha256").update(content).digest("hex");
    const page = "<p>hi</p>";
    const pageHash = new Bun.CryptoHasher("sha256").update(page).digest("hex");
    const plan = await (
      await api.call("POST", "/v1/previews/flow/deployments", {
        body: {
          files: {
            "index.html": { hash: pageHash, size: page.length },
            "app.js": { hash, size: content.length },
          },
        },
      })
    ).json();
    const { deploymentId } = plan as { deploymentId: string };
    await api.call("PUT", `/v1/blobs/${hash}`, { body: content });
    await api.call("PUT", `/v1/blobs/${pageHash}`, { body: page });
    const done = await api.call("POST", `/v1/previews/flow/deployments/${deploymentId}/finalize`);
    expect(codes(DeployResponse.parse(await done.json()))).toEqual(["ROOT_RELATIVE_URL:app.js"]);
  });
});
