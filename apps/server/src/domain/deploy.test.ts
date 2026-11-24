// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { sha256Hex, useTestContext } from "../test-support/context";
import { finalizeDeployment, planDeployment } from "./deploy";

const make = useTestContext();

async function file(content: string) {
  return { hash: await sha256Hex(content), size: new TextEncoder().encode(content).length };
}

async function upload(deps: ReturnType<typeof make>["ctx"]["deps"], content: string) {
  await deps.blobs.put(new TextEncoder().encode(content), await sha256Hex(content));
}

describe("deploy flow", () => {
  test("plan lists missing blobs; finalize fails until they exist, then promotes", async () => {
    const { ctx } = make();
    const { deps } = ctx;
    const index = await file("<h1>hi</h1>");
    const plan = await planDeployment(deps, {
      name: "demo",
      files: { "index.html": index },
      createdBy: "tester",
    });
    expect(plan.missing).toEqual([index.hash]);
    await expect(
      finalizeDeployment(deps, { name: "demo", deploymentId: plan.deploymentId }),
    ).rejects.toMatchObject({ code: "BLOBS_MISSING", status: 409 });
    expect(deps.previews.findByName("demo")?.currentDeploymentId).toBeNull();

    await upload(deps, "<h1>hi</h1>");
    const result = await finalizeDeployment(deps, {
      name: "demo",
      deploymentId: plan.deploymentId,
    });
    expect(result.created).toBe(true);
    expect(result.preview.currentDeploymentId).toBe(plan.deploymentId);
    expect(deps.previews.findByName("demo")?.currentDeploymentId).toBe(plan.deploymentId);
    expect(deps.deployments.find(plan.deploymentId)?.status).toBe("ready");
  });

  test("upsert by name: first deploy creates a 22-char id, later deploys reuse it", async () => {
    const { ctx, clock } = make();
    const { deps } = ctx;
    await upload(deps, "v1");
    await upload(deps, "v2");
    const first = await planDeployment(deps, {
      name: "site",
      files: { "index.html": await file("v1") },
      createdBy: "a",
    });
    await finalizeDeployment(deps, { name: "site", deploymentId: first.deploymentId });
    clock.advance(10);
    const second = await planDeployment(deps, {
      name: "site",
      files: { "index.html": await file("v2") },
      createdBy: "a",
    });
    const result = await finalizeDeployment(deps, {
      name: "site",
      deploymentId: second.deploymentId,
    });
    expect(first.previewId).toHaveLength(22);
    expect(second.previewId).toBe(first.previewId);
    expect(result.created).toBe(false);
    expect(result.preview.currentDeploymentId).toBe(second.deploymentId);
  });

  test("dedup: same content under two paths needs one blob, and a known blob is not missing", async () => {
    const { ctx } = make();
    const { deps } = ctx;
    const same = await file("shared");
    const plan = await planDeployment(deps, {
      name: "dedup",
      files: { "index.html": same, "copy.html": same },
      createdBy: "a",
    });
    expect(plan.missing).toEqual([same.hash]);
    await upload(deps, "shared");
    const again = await planDeployment(deps, {
      name: "dedup",
      files: { "index.html": same },
      createdBy: "a",
    });
    expect(again.missing).toEqual([]);
  });

  test("applies the default TTL to new previews", async () => {
    const { ctx } = make();
    await planDeployment(ctx.deps, {
      name: "ttl",
      files: { "index.html": await file("x") },
      createdBy: "a",
    });
    expect(ctx.deps.previews.findByName("ttl")?.expiresAt).toBe("2026-01-08T00:00:00.000Z");
  });

  test("rejects bad input with typed errors", async () => {
    const { ctx } = make();
    const f = await file("x");
    const plan = (input: object) =>
      planDeployment(ctx.deps, {
        name: "ok",
        files: { "index.html": f },
        createdBy: "a",
        ...input,
      });
    await expect(plan({ name: "Bad Name" })).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(plan({ files: {} })).rejects.toMatchObject({ code: "INVALID_MANIFEST" });
    await expect(plan({ files: { "../x.html": f } })).rejects.toMatchObject({
      code: "INVALID_PATH",
    });
    await expect(plan({ files: { "a.html": f } })).rejects.toMatchObject({ code: "ENTRY_MISSING" });
    await expect(plan({ createdBy: " " })).rejects.toMatchObject({ code: "INVALID_ACTOR" });
    expect(ctx.deps.previews.findByName("ok")).toBeNull();
  });

  test("finalize rejects unknown previews, foreign deployments and repeats", async () => {
    const { ctx } = make();
    const { deps } = ctx;
    await upload(deps, "x");
    const f = await file("x");
    const a = await planDeployment(deps, { name: "a", files: { "index.html": f }, createdBy: "t" });
    await planDeployment(deps, { name: "b", files: { "index.html": f }, createdBy: "t" });
    await expect(
      finalizeDeployment(deps, { name: "nope", deploymentId: a.deploymentId }),
    ).rejects.toMatchObject({ code: "PREVIEW_NOT_FOUND" });
    await expect(
      finalizeDeployment(deps, { name: "b", deploymentId: a.deploymentId }),
    ).rejects.toMatchObject({ code: "DEPLOYMENT_NOT_FOUND" });
    await finalizeDeployment(deps, { name: "a", deploymentId: a.deploymentId });
    await expect(
      finalizeDeployment(deps, { name: "a", deploymentId: a.deploymentId }),
    ).rejects.toMatchObject({ code: "DEPLOYMENT_ALREADY_FINAL" });
  });
});
