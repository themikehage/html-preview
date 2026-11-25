// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import type { DeployResponse, Visibility } from "@html-preview/shared";
import type { ApiClient } from "./client";
import { UsageError } from "./errors";
import { mapPool } from "./pool";
import { scanSource, slugify } from "./scan";

const UPLOAD_CONCURRENCY = 6;

export interface DeployOptions {
  target: string;
  name?: string | undefined;
  ttl?: number | undefined;
  visibility?: Visibility | undefined;
  entry?: string | undefined;
  message?: string | undefined;
  pinned?: boolean | undefined;
}

/** Manifest flow: hash locally, upload only the blobs the server lacks, finalize. */
export async function deployOnce(
  client: ApiClient,
  cwd: string,
  options: DeployOptions,
): Promise<DeployResponse> {
  const source = await scanSource(cwd, options.target);
  const name = options.name ?? source.name;
  if (name === "" || name !== slugify(name)) {
    throw new UsageError(
      `Invalid preview name ${JSON.stringify(name)}`,
      "Pass --name with lowercase letters, digits and hyphens",
      "INVALID_NAME",
    );
  }
  const files = Object.fromEntries(
    source.files.map((file) => [file.path, { hash: file.hash, size: file.size }]),
  );
  const plan = await client.plan(name, {
    files,
    ...(options.entry ? { entry: options.entry } : {}),
    ...(options.message ? { message: options.message } : {}),
    ...(options.visibility ? { visibility: options.visibility } : {}),
    ...(options.ttl !== undefined ? { ttl: options.ttl } : {}),
  });
  const byHash = new Map(source.files.map((file) => [file.hash, file.abs]));
  await mapPool(plan.missing, UPLOAD_CONCURRENCY, async (hash) => {
    const abs = byHash.get(hash);
    if (!abs) throw new Error(`Server asked for unknown blob ${hash}`);
    await client.uploadBlob(hash, await readFile(abs));
  });
  const result = await client.finalize(name, plan.deploymentId);
  if (!options.pinned) return result;
  const pinned = await client.update(name, { pinned: true });
  return { ...result, expiresAt: pinned.expiresAt };
}
