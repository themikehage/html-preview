// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Sha256 } from "@html-preview/shared";
import type { BlobSource, BlobStore } from "../ports/blob-store.port";
import { BadRequest } from "./errors";

async function* chunksOf(source: BlobSource): AsyncGenerator<Uint8Array> {
  if (source instanceof Uint8Array) {
    yield source;
    return;
  }
  const reader = source.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

export class FsBlobStore implements BlobStore {
  private readonly tmpDir: string;

  constructor(private readonly root: string) {
    this.tmpDir = join(root, ".tmp");
  }

  pathFor(hash: string): string {
    this.assertHash(hash);
    return join(this.root, hash.slice(0, 2), hash.slice(2, 4), hash);
  }

  async has(hash: string): Promise<boolean> {
    try {
      return (await stat(this.pathFor(hash))).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async open(hash: string): Promise<Blob | null> {
    return (await this.has(hash)) ? Bun.file(this.pathFor(hash)) : null;
  }

  async put(source: BlobSource, expectedHash: string): Promise<void> {
    const destination = this.pathFor(expectedHash);
    if (await this.has(expectedHash)) return;
    await mkdir(this.tmpDir, { recursive: true });
    const temp = join(this.tmpDir, randomUUID());
    const hasher = new Bun.CryptoHasher("sha256");
    try {
      const writer = Bun.file(temp).writer();
      for await (const chunk of chunksOf(source)) {
        hasher.update(chunk);
        writer.write(chunk);
      }
      await writer.end();
      const actual = hasher.digest("hex");
      if (actual !== expectedHash) {
        throw new BadRequest(
          `Content hash ${actual} does not match ${expectedHash}`,
          "Upload the exact bytes listed in the manifest for this hash",
          "HASH_MISMATCH",
        );
      }
      await chmod(temp, 0o444);
      await mkdir(dirname(destination), { recursive: true });
      await rename(temp, destination);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  private assertHash(hash: string): void {
    if (!Sha256.safeParse(hash).success) {
      throw new BadRequest(
        "Invalid SHA-256 hash",
        "Use a lowercase hex SHA-256 digest (64 characters)",
        "INVALID_HASH",
      );
    }
  }
}
