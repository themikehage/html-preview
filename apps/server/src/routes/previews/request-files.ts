// SPDX-License-Identifier: MIT

import type { Context } from "hono";
import { BadRequest, UnsupportedMediaType } from "../../core/infra/errors";
import { type ArchiveLimits, extractTarGz, extractZip } from "../../domain/archive";
import type { DeployFile } from "../../domain/deploy-files";

const ZIP = new Set(["application/zip", "application/x-zip-compressed"]);
const GZIP = new Set(["application/gzip", "application/x-gzip", "application/x-tar+gzip"]);

async function bytes(c: Context): Promise<Uint8Array> {
  return new Uint8Array(await c.req.arrayBuffer());
}

async function multipartFiles(c: Context): Promise<DeployFile[]> {
  const form = await c.req.raw.formData().catch(() => {
    throw new BadRequest("Malformed multipart body", "Send files as multipart/form-data parts");
  });
  const files: DeployFile[] = [];
  for (const [field, value] of form.entries()) {
    if (typeof value === "string") continue;
    files.push({ path: value.name || field, content: new Uint8Array(await value.arrayBuffer()) });
  }
  return files;
}

export async function readDeployFiles(c: Context, limits: ArchiveLimits): Promise<DeployFile[]> {
  const type = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "text/html") return [{ path: "index.html", content: await bytes(c) }];
  if (ZIP.has(type)) return extractZip(await bytes(c), limits);
  if (GZIP.has(type)) return extractTarGz(await bytes(c), limits);
  if (type === "multipart/form-data") return multipartFiles(c);
  throw new UnsupportedMediaType(
    `Content-Type "${type || "none"}" is not supported for deploys`,
    "Send text/html, application/zip, application/gzip (tar.gz) or multipart/form-data",
  );
}
