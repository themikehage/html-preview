// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { PreviewDetail } from "@html-preview/shared";
import { useCli } from "./test-support";

const make = useCli({ MAX_VISIBILITY: "public" });

describe("--spa (H9-A4)", () => {
  test("deploy --spa turns the fallback on and --no-spa turns it off", async () => {
    const h = make();
    h.write("site/index.html", "<p>app</p>");
    expect(await h.run("deploy", "site", "--name", "app", "--spa", "--json")).toBe(0);
    expect(await h.run("info", "app", "--json")).toBe(0);
    expect(PreviewDetail.parse(h.json()).preview.spa).toBe(true);

    expect(await h.run("deploy", "site", "--name", "app", "--no-spa", "--json")).toBe(0);
    expect(await h.run("info", "app", "--json")).toBe(0);
    expect(PreviewDetail.parse(h.json()).preview.spa).toBe(false);
  });

  test("a redeploy without the flag keeps the setting; both flags are a usage error", async () => {
    const h = make();
    h.write("site/index.html", "<p>app</p>");
    await h.run("deploy", "site", "--name", "app", "--spa", "--json");
    await h.run("deploy", "site", "--name", "app", "--json");
    await h.run("info", "app", "--json");
    expect(PreviewDetail.parse(h.json()).preview.spa).toBe(true);
    expect(await h.run("deploy", "site", "--spa", "--no-spa", "--json")).toBe(1);
  });
});
