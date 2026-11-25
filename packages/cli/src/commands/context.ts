// SPDX-License-Identifier: MIT

import type { Parsed } from "../args";
import { ApiClient } from "../client";
import { resolveCredentials } from "../config";
import { UsageError } from "../errors";
import { printJson } from "../output";
import type { Runtime } from "../runtime";

export interface Ctx {
  rt: Runtime;
  args: Parsed;
  version: string;
}

export async function makeClient(ctx: Ctx): Promise<ApiClient> {
  const credentials = await resolveCredentials(ctx.rt, ctx.args);
  return new ApiClient({
    baseUrl: credentials.url,
    key: credentials.key,
    fetch: ctx.rt.fetch,
    sleep: ctx.rt.sleep,
    userAgent: `html-preview-cli/${ctx.version}`,
  });
}

export function requireArg(ctx: Ctx, index: number, what: string, usage: string): string {
  const value = ctx.args.positionals[index];
  if (!value) throw new UsageError(`Missing ${what}`, `Usage: html-preview ${usage}`);
  return value;
}

/** `--json` prints the value exactly; otherwise `human` lines go to stdout. */
export function emit(ctx: Ctx, value: unknown, human: () => string[]): void {
  if (ctx.args.json) printJson(ctx.rt, value);
  else for (const line of human()) ctx.rt.out(`${line}\n`);
}
