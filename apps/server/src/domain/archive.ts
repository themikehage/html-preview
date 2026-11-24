// SPDX-License-Identifier: MIT

import { Gunzip, unzipSync } from "fflate";
import { BadRequest, PayloadTooLarge } from "../core/infra/errors";
import type { DeployFile } from "./deploy-files";

export interface ArchiveLimits {
  maxBytes: number;
  maxFiles: number;
}

const BLOCK = 512;
const decoder = new TextDecoder();

function invalidArchive(reason: string): BadRequest {
  return new BadRequest(
    `Invalid archive: ${reason}`,
    "Upload a valid .zip or .tar.gz containing regular files only",
    "INVALID_ARCHIVE",
  );
}

function tooLarge(limits: ArchiveLimits): PayloadTooLarge {
  return new PayloadTooLarge(
    `Archive exceeds ${limits.maxBytes} bytes or ${limits.maxFiles} files once extracted`,
    "Deploy fewer or smaller files, or raise MAX_DEPLOY_BYTES / MAX_DEPLOY_FILES",
  );
}

function isJunk(path: string): boolean {
  return path.startsWith("__MACOSX/") || path.split("/").pop() === ".DS_Store";
}

export function stripSingleRoot(files: DeployFile[]): DeployFile[] {
  if (files.length === 0 || files.some((file) => file.path === "index.html")) return files;
  const roots = new Set(files.map((file) => file.path.split("/")[0]));
  const [root] = [...roots];
  if (roots.size !== 1 || !root || files.some((file) => !file.path.includes("/"))) return files;
  return files.map((file) => ({ ...file, path: file.path.slice(root.length + 1) }));
}

export function extractZip(data: Uint8Array, limits: ArchiveLimits): DeployFile[] {
  let count = 0;
  let declared = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        if (file.name.endsWith("/") || isJunk(file.name)) return false;
        count += 1;
        declared += file.originalSize;
        if (count > limits.maxFiles || declared > limits.maxBytes) throw tooLarge(limits);
        return true;
      },
    });
  } catch (error) {
    if (error instanceof PayloadTooLarge) throw error;
    throw invalidArchive("not a readable zip file");
  }
  const files = Object.entries(entries).map(([path, content]) => ({ path, content }));
  if (files.reduce((total, file) => total + file.content.length, 0) > limits.maxBytes) {
    throw tooLarge(limits);
  }
  return stripSingleRoot(files);
}

function gunzipLimited(data: Uint8Array, limits: ArchiveLimits): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Gunzip((chunk) => {
    total += chunk.length;
    if (total > limits.maxBytes + BLOCK * (limits.maxFiles + 2) * 3) throw tooLarge(limits);
    chunks.push(chunk);
  });
  try {
    stream.push(data, true);
  } catch (error) {
    if (error instanceof PayloadTooLarge) throw error;
    throw invalidArchive("not a readable gzip file");
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function field(block: Uint8Array, start: number, length: number): string {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return decoder.decode(end === -1 ? raw : raw.subarray(0, end));
}

function parsePax(content: Uint8Array): Record<string, string> {
  const records: Record<string, string> = {};
  let rest = decoder.decode(content);
  while (rest.length > 0) {
    const space = rest.indexOf(" ");
    const length = Number.parseInt(rest.slice(0, space), 10);
    if (space < 1 || !Number.isInteger(length) || length <= space) break;
    const record = rest.slice(space + 1, length - 1);
    const eq = record.indexOf("=");
    if (eq > 0) records[record.slice(0, eq)] = record.slice(eq + 1);
    rest = rest.slice(length);
  }
  return records;
}

export function extractTarGz(data: Uint8Array, limits: ArchiveLimits): DeployFile[] {
  const tar = gunzipLimited(data, limits);
  const files: DeployFile[] = [];
  let total = 0;
  let longName: string | undefined;
  let paxPath: string | undefined;
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(field(header, 124, 12).trim() || "0", 8);
    if (!Number.isInteger(size) || size < 0) throw invalidArchive("corrupt tar header");
    const type = field(header, 156, 1) || "0";
    const start = offset + BLOCK;
    if (start + size > tar.length) throw invalidArchive("truncated tar entry");
    const content = tar.subarray(start, start + size);
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "x") {
      paxPath = parsePax(content).path;
    } else if (type === "L") {
      longName = field(content, 0, content.length);
    } else if (type === "0" || type === "7") {
      const prefix = field(header, 345, 155);
      const base = field(header, 0, 100);
      const path = paxPath ?? longName ?? (prefix ? `${prefix}/${base}` : base);
      paxPath = undefined;
      longName = undefined;
      if (isJunk(path)) continue;
      total += size;
      if (files.length + 1 > limits.maxFiles || total > limits.maxBytes) throw tooLarge(limits);
      files.push({ path, content: content.slice() });
    } else if (type === "1" || type === "2") {
      throw invalidArchive("links are not allowed");
    }
  }
  return stripSingleRoot(files);
}
