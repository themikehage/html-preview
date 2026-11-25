// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { useCli } from "./test-support";

const make = useCli();

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for watch cycle");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("watch (H6-A5)", () => {
  test("re-deploys on change with debounce, uploading only changed blobs", async () => {
    const h = make();
    h.write("w/index.html", "<p>1</p>");
    h.write("w/app.css", "a{}");
    const done = h.run("watch", "w", "--json", "--debounce", "50");
    await until(() => h.stdout.length === 1);
    expect(JSON.parse(h.stdout[0] as string)).toMatchObject({ created: true, uploaded: 2 });

    h.write("w/app.css", "a{color:red}");
    h.write("w/app.css", "a{color:blue}");
    await until(() => h.stdout.length === 2);
    expect(JSON.parse(h.stdout[1] as string)).toMatchObject({ created: false, uploaded: 1 });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(h.stdout).toHaveLength(2);

    h.stop.abort();
    expect(await done).toBe(0);
  });

  test("an API error during a cycle is reported and watching continues", async () => {
    let broken = false;
    const h = useCli(
      {},
      (inner) => (input, init) =>
        broken
          ? Promise.resolve(
              new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "no" } }), {
                status: 401,
              }),
            )
          : inner(input, init),
    )();
    h.write("w/index.html", "<p>1</p>");
    const done = h.run("watch", "w", "--json", "--debounce", "50");
    await until(() => h.stdout.length === 1);
    broken = true;
    h.write("w/index.html", "<p>2</p>");
    await until(() => h.stdout.length === 2);
    expect(JSON.parse(h.stdout[1] as string)).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    broken = false;
    h.write("w/index.html", "<p>3</p>");
    await until(() => h.stdout.length === 3);
    expect(JSON.parse(h.stdout[2] as string)).toMatchObject({ uploaded: 1 });
    h.stop.abort();
    expect(await done).toBe(0);
  });
});
