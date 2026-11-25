// SPDX-License-Identifier: MIT

import { deployOnce } from "../deploy";
import { deployLines } from "../output";
import { type Ctx, emit, makeClient, requireArg } from "./context";

export function deployOptions(ctx: Ctx, target: string) {
  const { args } = ctx;
  return {
    target,
    name: args.name,
    ttl: args.ttl,
    visibility: args.visibility,
    entry: args.entry,
    message: args.message,
    pinned: args.pinned,
    spa: args.spa,
  };
}

export async function deploy(ctx: Ctx): Promise<void> {
  const target = requireArg(ctx, 0, "folder or file to deploy", "deploy <dir|file>");
  const client = await makeClient(ctx);
  const result = await deployOnce(client, ctx.rt.cwd, deployOptions(ctx, target));
  emit(ctx, result, () => deployLines(result));
}
