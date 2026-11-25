// SPDX-License-Identifier: MIT

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { BackupResult, ErrorBody } from "@html-preview/shared";
import { createApiKey } from "./domain/api-keys";
import { useApi } from "./test-support/api";

const make = useApi();

describe("admin backup (H8-A4)", () => {
  test("writes a consistent, restorable snapshot under DATA_DIR/backups", async () => {
    const api = make();
    await api.call("PUT", "/v1/previews/demo", {
      body: "<h1>hi</h1>",
      headers: { "content-type": "text/html" },
    });
    const res = await api.call("POST", "/v1/admin/backup");
    expect(res.status).toBe(201);
    const body = BackupResult.parse(await res.json());
    expect(body.name).toMatch(/^html-preview-\d{8}T\d+Z\.sqlite$/);
    expect(body.bytes).toBeGreaterThan(0);

    const file = join(api.ctx.config.DATA_DIR, "backups", body.name);
    const copy = new Database(file, { readonly: true });
    const rows = copy.query("SELECT name FROM previews").all();
    expect(rows).toEqual([{ name: "demo" }]);
    expect(copy.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    copy.close();
  });

  test("requires the admin scope", async () => {
    const api = make();
    const { key } = createApiKey(api.ctx.deps, "deployer", ["deploy", "read"]);
    const res = await api.call("POST", "/v1/admin/backup", { key });
    expect(res.status).toBe(403);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("INSUFFICIENT_SCOPE");
    expect((await api.call("POST", "/v1/admin/backup", { key: null })).status).toBe(401);
  });
});
