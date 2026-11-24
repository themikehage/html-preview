// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DeployResponse } from "@html-preview/shared";
import { type Api, useApi } from "../test-support/api";
import { ageBlobs, blobFiles } from "../test-support/blobs";
import { collectGarbage } from "./gc";
import { runReaper } from "./reaper";

const make = useApi();
const makeKeep2 = useApi({ KEEP_DEPLOYMENTS: "2" });
const html = { "content-type": "text/html" };
const HOUR = 3600;

async function deploy(api: Api, name: string, body: string, query = ""): Promise<DeployResponse> {
  const res = await api.call("PUT", `/v1/previews/${name}${query}`, { body, headers: html });
  expect(res.status).toBeLessThan(300);
  return DeployResponse.parse(await res.json());
}

const pathOf = (deploy: DeployResponse): string => new URL(deploy.url).pathname;

describe("TTL (H4-A4)", () => {
  test("expiresAt comes from ttl or DEFAULT_TTL_HOURS; ttl=0 never expires", async () => {
    const api = useApi({ DEFAULT_TTL_HOURS: "24" })();
    const byDefault = await deploy(api, "def", "<p>1</p>");
    expect(byDefault.expiresAt).toBe("2026-01-02T00:00:00.000Z");
    const custom = await deploy(api, "custom", "<p>2</p>", "?ttl=1");
    expect(custom.expiresAt).toBe("2026-01-01T01:00:00.000Z");
    expect((await deploy(api, "forever", "<p>3</p>", "?ttl=0")).expiresAt).toBeNull();
  });

  test("an expired preview answers 404 on content immediately, before the reaper runs", async () => {
    const api = make();
    const site = await deploy(api, "soon", "<p>hi</p>", "?ttl=1");
    expect((await api.content(`${pathOf(site)}/`)).status).toBe(200);
    api.clock.advance(HOUR + 1);
    expect((await api.content(`${pathOf(site)}/`)).status).toBe(404);
    expect(api.ctx.deps.previews.findByName("soon")).not.toBeNull();
  });

  test("pinned previews never expire, even across reaper runs", async () => {
    const api = make();
    const site = await deploy(api, "keeper", "<p>hi</p>", "?ttl=1");
    await api.call("PATCH", "/v1/previews/keeper", { body: { pinned: true } });
    api.clock.advance(30 * 24 * HOUR);
    expect((await api.content(`${pathOf(site)}/`)).status).toBe(200);
    expect((await runReaper(api.ctx.deps)).expiredPreviews).toBe(0);
    expect(api.ctx.deps.previews.findByName("keeper")).not.toBeNull();
  });
});

describe("reaper and GC (H4-A5)", () => {
  test("deletes expired previews and, after the grace period, their blobs", async () => {
    const api = make();
    await deploy(api, "gone", "<p>bye</p>", "?ttl=1");
    await deploy(api, "stays", "<p>stay</p>", "?ttl=0");
    expect(blobFiles(api.dataDir)).toHaveLength(2);
    api.clock.advance(2 * HOUR);
    const first = await runReaper(api.ctx.deps);
    expect(first.expiredPreviews).toBe(1);
    expect(first.blobsDeleted).toBe(0);
    ageBlobs(api.dataDir, new Date(api.clock.now().getTime() - 2 * HOUR * 1000));
    const second = await runReaper(api.ctx.deps);
    expect(second.blobsDeleted).toBe(1);
    expect(second.bytesFreed).toBe("<p>bye</p>".length);
    expect(blobFiles(api.dataDir)).toHaveLength(1);
    expect(api.ctx.deps.previews.findByName("gone")).toBeNull();
    expect(api.ctx.deps.previews.findByName("stays")).not.toBeNull();
  });

  test("prunes deployments beyond KEEP_DEPLOYMENTS but never the current one", async () => {
    const api = makeKeep2();
    const ids: string[] = [];
    for (const n of [1, 2, 3, 4]) {
      api.clock.advance(1);
      ids.push((await deploy(api, "app", `<p>v${n}</p>`)).deploymentId);
    }
    const [oldest = "", , third = "", fourth = ""] = ids;
    await api.call("POST", "/v1/previews/app/rollback", { body: { deploymentId: oldest } });
    const report = await runReaper(api.ctx.deps);
    expect(report.prunedDeployments).toBe(1);
    const kept = api.ctx.deps.deployments.listReady(
      api.ctx.deps.previews.findByName("app")?.id ?? "",
    );
    expect(kept.map((item) => item.id).sort()).toEqual([oldest, third, fourth].sort());
    expect(api.ctx.deps.previews.findByName("app")?.currentDeploymentId).toBe(oldest);
  });

  test("blobs shared with a surviving deployment are never collected", async () => {
    const api = makeKeep2();
    await deploy(api, "app", "<p>same</p>");
    api.clock.advance(1);
    await deploy(api, "app", "<p>same</p>");
    api.clock.advance(1);
    await deploy(api, "app", "<p>new</p>");
    ageBlobs(api.dataDir, new Date(api.clock.now().getTime() - 2 * HOUR * 1000));
    await runReaper(api.ctx.deps);
    expect(blobFiles(api.dataDir)).toHaveLength(2);
    const body = await api.content(`${pathOf(await deploy(api, "app", "<p>same</p>"))}/`);
    expect(await body.text()).toContain("same");
  });

  test("abandoned plans (pending deployment, preview without a live one) are cleaned up", async () => {
    const api = make();
    const hash = "a".repeat(64);
    const planned = await api.call("POST", "/v1/previews/half/deployments", {
      body: { files: { "index.html": { hash, size: 3 } } },
    });
    expect(planned.status).toBe(201);
    expect((await runReaper(api.ctx.deps)).stalePending).toBe(0);
    expect(api.ctx.deps.previews.findByName("half")).not.toBeNull();
    api.clock.advance(2 * HOUR);
    const report = await runReaper(api.ctx.deps);
    expect(report).toMatchObject({ stalePending: 1, abandonedPreviews: 1 });
    expect(api.ctx.deps.previews.findByName("half")).toBeNull();
    expect(api.ctx.deps.deployments.count()).toBe(0);
  });

  test("a preview with a live deployment keeps working when a newer plan is abandoned", async () => {
    const api = make();
    await deploy(api, "live", "<p>v1</p>");
    await api.call("POST", "/v1/previews/live/deployments", {
      body: { files: { "index.html": { hash: "b".repeat(64), size: 3 } } },
    });
    api.clock.advance(2 * HOUR);
    const report = await runReaper(api.ctx.deps);
    expect(report).toMatchObject({ stalePending: 1, abandonedPreviews: 0 });
    expect(api.ctx.deps.previews.findByName("live")?.currentDeploymentId).not.toBeNull();
  });

  test("GC keeps referenced and young blobs, removes old orphans and stale temp files, and is repeatable", async () => {
    const api = make();
    await deploy(api, "app", "<p>kept</p>", "?ttl=0");
    const orphan = "<p>orphan</p>";
    const hash = new Bun.CryptoHasher("sha256").update(orphan).digest("hex");
    await api.ctx.deps.blobs.put(new TextEncoder().encode(orphan), hash);
    writeFileSync(join(api.dataDir, "blobs", ".tmp", "partial"), "x");
    expect(blobFiles(api.dataDir)).toHaveLength(2);

    expect((await collectGarbage(api.ctx.deps)).blobsDeleted).toBe(0);
    ageBlobs(api.dataDir, new Date(api.clock.now().getTime() - 2 * HOUR * 1000));
    const swept = await collectGarbage(api.ctx.deps);
    expect(swept).toMatchObject({ blobsDeleted: 1, tempFilesRemoved: 1 });
    expect(await api.ctx.deps.blobs.has(hash)).toBe(false);
    expect(blobFiles(api.dataDir)).toHaveLength(1);
    expect(await collectGarbage(api.ctx.deps)).toEqual({
      blobsDeleted: 0,
      bytesFreed: 0,
      tempFilesRemoved: 0,
    });
  });

  test("an interrupted run (rows deleted, blobs left) is completed by the next run", async () => {
    const api = make();
    await deploy(api, "tmp", "<p>x</p>", "?ttl=1");
    api.clock.advance(2 * HOUR);
    for (const preview of api.ctx.deps.previews.listExpired(api.clock.now().toISOString())) {
      api.ctx.deps.previews.delete(preview.id);
    }
    ageBlobs(api.dataDir, new Date(api.clock.now().getTime() - 2 * HOUR * 1000));
    expect((await runReaper(api.ctx.deps)).blobsDeleted).toBe(1);
    expect(blobFiles(api.dataDir)).toHaveLength(0);
  });
});
