// SPDX-License-Identifier: MIT

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { UsageError } from "./errors";
import type { Runtime } from "./runtime";

export interface Credentials {
  url: string;
  key: string;
}

export function normalizeUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UsageError(`Invalid URL ${JSON.stringify(raw)}`, "Use e.g. http://localhost:3000");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UsageError(
      `Unsupported protocol in ${JSON.stringify(raw)}`,
      "Use http:// or https://",
    );
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

export function defaultConfigDir(env: Record<string, string | undefined>, home: string): string {
  const base = env.XDG_CONFIG_HOME || join(home, ".config");
  return join(base, "html-preview");
}

async function readStored(rt: Runtime): Promise<Partial<Credentials>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(rt.configDir, "config.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return {};
    const { url, key } = parsed as Record<string, unknown>;
    return {
      ...(typeof url === "string" ? { url } : {}),
      ...(typeof key === "string" ? { key } : {}),
    };
  } catch {
    return {};
  }
}

/** Flags beat environment variables, which beat the stored config. */
export async function resolveCredentials(
  rt: Runtime,
  flags: { url?: string | undefined; key?: string | undefined },
): Promise<Credentials> {
  const stored = await readStored(rt);
  const url = flags.url ?? rt.env.HTML_PREVIEW_URL ?? stored.url;
  const key = flags.key ?? rt.env.HTML_PREVIEW_KEY ?? stored.key;
  if (!url || !key) {
    throw new UsageError(
      "Not logged in: server URL and API key are required",
      "Run `html-preview login --url <url> --key <key>` or set HTML_PREVIEW_URL and HTML_PREVIEW_KEY",
      "NOT_LOGGED_IN",
    );
  }
  return { url: normalizeUrl(url), key };
}

export async function saveCredentials(rt: Runtime, credentials: Credentials): Promise<string> {
  await mkdir(rt.configDir, { recursive: true, mode: 0o700 });
  const file = join(rt.configDir, "config.json");
  await writeFile(file, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return file;
}
