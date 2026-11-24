// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex, useTestContext } from "../../test-support/context";
import { FsBlobStore } from "./fs-blob-store";

const make = useTestContext();

function storeFor(dataDir: string): FsBlobStore {
  return new FsBlobStore(join(dataDir, "blobs"));
}

describe("FsBlobStore", () => {
  test("stores content at blobs/ab/cd/<sha256> and reports it", async () => {
    const { dataDir } = make();
    const store = storeFor(dataDir);
    const hash = await sha256Hex("hello");
    expect(await store.has(hash)).toBe(false);
    await store.put(new TextEncoder().encode("hello"), hash);
    expect(await store.has(hash)).toBe(true);
    expect(store.pathFor(hash)).toBe(
      join(dataDir, "blobs", hash.slice(0, 2), hash.slice(2, 4), hash),
    );
    expect(readFileSync(store.pathFor(hash), "utf8")).toBe("hello");
  });

  test("accepts streams", async () => {
    const { dataDir } = make();
    const store = storeFor(dataDir);
    const hash = await sha256Hex("streamed");
    await store.put(new Response("streamed").body as ReadableStream<Uint8Array>, hash);
    expect(await store.has(hash)).toBe(true);
  });

  test("rejects a hash mismatch and leaves no blob or temp file", async () => {
    const { dataDir } = make();
    const store = storeFor(dataDir);
    const wrong = await sha256Hex("other");
    await expect(store.put(new TextEncoder().encode("hello"), wrong)).rejects.toMatchObject({
      code: "HASH_MISMATCH",
      status: 400,
    });
    expect(await store.has(wrong)).toBe(false);
    expect(readdirSync(join(dataDir, "blobs", ".tmp"))).toEqual([]);
  });

  test("storing the same content twice keeps one blob", async () => {
    const { dataDir } = make();
    const store = storeFor(dataDir);
    const hash = await sha256Hex("same");
    await store.put(new TextEncoder().encode("same"), hash);
    await store.put(new TextEncoder().encode("same"), hash);
    expect(readdirSync(join(dataDir, "blobs", hash.slice(0, 2), hash.slice(2, 4)))).toEqual([hash]);
  });

  test("refuses hashes that are not sha256 hex (no path traversal)", async () => {
    const { dataDir } = make();
    const store = storeFor(dataDir);
    await expect(store.has("../../etc/passwd")).rejects.toMatchObject({ code: "INVALID_HASH" });
  });
});
