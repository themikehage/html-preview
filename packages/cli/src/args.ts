// SPDX-License-Identifier: MIT

import { parseArgs } from "node:util";
import type { Visibility } from "@html-preview/shared";
import { UsageError } from "./errors";

const VISIBILITIES: readonly Visibility[] = ["unlisted", "private", "public"];

const OPTIONS = {
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  url: { type: "string" },
  key: { type: "string" },
  name: { type: "string" },
  ttl: { type: "string" },
  visibility: { type: "string" },
  entry: { type: "string" },
  message: { type: "string", short: "m" },
  pinned: { type: "boolean" },
  to: { type: "string" },
  query: { type: "string", short: "q" },
  limit: { type: "string" },
  debounce: { type: "string" },
  expires: { type: "string" },
  label: { type: "string" },
  list: { type: "boolean" },
  revoke: { type: "string" },
} as const;

export interface Parsed {
  command: string | undefined;
  positionals: string[];
  json: boolean;
  help: boolean;
  version: boolean;
  url?: string | undefined;
  key?: string | undefined;
  name?: string | undefined;
  ttl?: number | undefined;
  visibility?: Visibility | undefined;
  entry?: string | undefined;
  message?: string | undefined;
  pinned: boolean;
  to?: string | undefined;
  query?: string | undefined;
  limit?: number | undefined;
  debounce?: number | undefined;
  expires?: number | undefined;
  label?: string | undefined;
  list: boolean;
  revoke?: string | undefined;
}

function toInt(flag: string, raw: string | undefined, min: number): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new UsageError(`--${flag} must be an integer >= ${min}`, `Got ${JSON.stringify(raw)}`);
  }
  return value;
}

function toVisibility(raw: string | undefined): Visibility | undefined {
  if (raw === undefined) return undefined;
  const found = VISIBILITIES.find((visibility) => visibility === raw);
  if (!found) {
    throw new UsageError(
      `Invalid --visibility ${JSON.stringify(raw)}`,
      "Use unlisted, private or public",
    );
  }
  return found;
}

export function parseCli(argv: string[]): Parsed {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
      "Run html-preview --help",
    );
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  return {
    command,
    positionals: rest,
    json: values.json ?? false,
    help: values.help ?? false,
    version: values.version ?? false,
    url: values.url,
    key: values.key,
    name: values.name,
    ttl: toInt("ttl", values.ttl, 0),
    visibility: toVisibility(values.visibility),
    entry: values.entry,
    message: values.message,
    pinned: values.pinned ?? false,
    to: values.to,
    query: values.query,
    limit: toInt("limit", values.limit, 1),
    debounce: toInt("debounce", values.debounce, 0),
    expires: toInt("expires", values.expires, 1),
    label: values.label,
    list: values.list ?? false,
    revoke: values.revoke,
  };
}
