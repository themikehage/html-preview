// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { UsageError } from "./errors";
import { type IgnoreRule, isIgnored, parseIgnore } from "./ignore";
import { mapPool } from "./pool";

const HASH_CONCURRENCY = 8;
const ALWAYS_SKIPPED = new Set(["node_modules"]);
const IGNORE_FILE = ".previewignore";

export interface LocalFile {
  /** Path inside the preview, with `/` separators. */
  path: string;
  abs: string;
  size: number;
  hash: string;
}

export interface Source {
  files: LocalFile[];
  /** Default preview name, slugified from the folder or file name. */
  name: string;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/, "");
}

export function hashFile(abs: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hasher = createHash("sha256");
    createReadStream(abs)
      .on("data", (chunk) => hasher.update(chunk))
      .on("error", reject)
      .on("end", () => resolveHash(hasher.digest("hex")));
  });
}

async function loadRules(root: string): Promise<IgnoreRule[]> {
  try {
    return parseIgnore(await readFile(join(root, IGNORE_FILE), "utf8"));
  } catch {
    return [];
  }
}

async function walk(
  root: string,
  rules: IgnoreRule[],
  relDir = "",
): Promise<{ path: string; abs: string; size: number }[]> {
  const found: { path: string; abs: string; size: number }[] = [];
  const entries = await readdir(join(root, relDir), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || ALWAYS_SKIPPED.has(entry.name)) continue;
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    const abs = join(root, rel);
    if (entry.isDirectory()) {
      if (!isIgnored(rules, rel, true)) found.push(...(await walk(root, rules, rel)));
    } else if (entry.isFile() && !isIgnored(rules, rel, false)) {
      found.push({ path: rel, abs, size: (await stat(abs)).size });
    }
  }
  return found;
}

function emptyError(target: string): UsageError {
  return new UsageError(
    `No files to deploy in ${target}`,
    "Dotfiles, node_modules and .previewignore matches are skipped; check the path",
    "NO_FILES",
  );
}

export async function scanSource(cwd: string, target: string): Promise<Source> {
  const abs = resolve(cwd, target);
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(abs);
  } catch {
    throw new UsageError(`Path not found: ${target}`, "Pass a folder or a single file");
  }
  const rawFiles = info.isDirectory()
    ? await walk(abs, await loadRules(abs))
    : [{ path: singlePath(abs), abs, size: info.size }];
  if (rawFiles.length === 0) throw emptyError(target);
  const stem = info.isDirectory() ? basename(abs) : basename(abs, extname(abs));
  const files = await mapPool(rawFiles, HASH_CONCURRENCY, async (file) => ({
    ...file,
    hash: await hashFile(file.abs),
  }));
  return { files, name: slugify(stem) };
}

/** A single HTML file becomes the entry page; any other file keeps its name. */
function singlePath(abs: string): string {
  return /\.html?$/i.test(abs) ? "index.html" : basename(abs);
}
