// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { sha256Hex, useTestContext } from "../test-support/context";
import { deletePreview } from "./delete";
import { finalizeDeployment, planDeployment } from "./deploy";
import { rollback } from "./rollback";

const make = useTestContext();

function pick(ids: string[], index: number): string {
  const id = ids[index];
  if (!id) throw new Error(`no deployment at ${index}`);
  return id;
}

async function deployVersions(count: number) {
  const test = make();
  const { deps } = test.ctx;
  const ids: string[] = [];
  for (let version = 1; version <= count; version++) {
    const content = `v${version}`;
    const hash = await sha256Hex(content);
    await deps.blobs.put(new TextEncoder().encode(content), hash);
    const plan = await planDeployment(deps, {
      name: "site",
      files: { "index.html": { hash, size: content.length } },
      createdBy: "t",
    });
    await finalizeDeployment(deps, { name: "site", deploymentId: plan.deploymentId });
    ids.push(plan.deploymentId);
    test.clock.advance(1);
  }
  return { deps, ids };
}

describe("rollback", () => {
  test("moves back one deployment at a time, then reports no previous", async () => {
    const { deps, ids } = await deployVersions(3);
    expect(rollback(deps, { name: "site" }).deployment.id).toBe(pick(ids, 1));
    expect(deps.previews.findByName("site")?.currentDeploymentId).toBe(pick(ids, 1));
    expect(rollback(deps, { name: "site" }).deployment.id).toBe(pick(ids, 0));
    expect(() => rollback(deps, { name: "site" })).toThrow(/no previous deployment/);
  });

  test("moves to a given deployment, including forward", async () => {
    const { deps, ids } = await deployVersions(3);
    rollback(deps, { name: "site", deploymentId: pick(ids, 0) });
    rollback(deps, { name: "site", deploymentId: pick(ids, 2) });
    expect(deps.previews.findByName("site")?.currentDeploymentId).toBe(pick(ids, 2));
  });

  test("rejects the current deployment, unknown ids, pending deployments and unknown previews", async () => {
    const { deps, ids } = await deployVersions(2);
    expect(() => rollback(deps, { name: "site", deploymentId: pick(ids, 1) })).toThrow(/already/);
    expect(() => rollback(deps, { name: "site", deploymentId: "d_nope" })).toThrow(
      /not a finalized/,
    );
    expect(() => rollback(deps, { name: "ghost" })).toThrow(/not found/);
    const hash = await sha256Hex("v1");
    const pending = await planDeployment(deps, {
      name: "site",
      files: { "index.html": { hash, size: 2 } },
      createdBy: "t",
    });
    expect(() => rollback(deps, { name: "site", deploymentId: pending.deploymentId })).toThrow(
      /not a finalized/,
    );
  });
});

describe("deletePreview", () => {
  test("removes the preview and its deployments but leaves blobs for GC", async () => {
    const { deps, ids } = await deployVersions(2);
    deletePreview(deps, "site");
    expect(deps.previews.findByName("site")).toBeNull();
    expect(deps.deployments.find(pick(ids, 0))).toBeNull();
    expect(await deps.blobs.has(await sha256Hex("v1"))).toBe(true);
    expect(() => deletePreview(deps, "site")).toThrow(/not found/);
  });
});
