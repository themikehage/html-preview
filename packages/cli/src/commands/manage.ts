// SPDX-License-Identifier: MIT

import { formatBytes, previewLine } from "../output";
import { type Ctx, emit, makeClient, requireArg } from "./context";

export async function list(ctx: Ctx): Promise<void> {
  const client = await makeClient(ctx);
  const page = await client.listPreviews({
    ...(ctx.args.query ? { q: ctx.args.query } : {}),
    ...(ctx.args.limit ? { limit: ctx.args.limit } : {}),
  });
  emit(ctx, page, () =>
    page.previews.length === 0 ? ["No previews"] : page.previews.map(previewLine),
  );
}

export async function info(ctx: Ctx): Promise<void> {
  const name = requireArg(ctx, 0, "preview name", "info <name>");
  const detail = await (await makeClient(ctx)).getPreview(name);
  emit(ctx, detail, () => [
    previewLine(detail.preview),
    ...detail.deployments.map((deployment) => {
      const mark = deployment.current ? "*" : " ";
      const note = deployment.message ? `  ${deployment.message}` : "";
      return `  ${mark} ${deployment.id}  ${deployment.createdAt}  ${deployment.fileCount} files, ${formatBytes(deployment.bytes)}${note}`;
    }),
  ]);
}

export async function open(ctx: Ctx): Promise<void> {
  const name = requireArg(ctx, 0, "preview name", "open <name>");
  const { preview } = await (await makeClient(ctx)).getPreview(name);
  if (!ctx.args.json) await ctx.rt.openUrl(preview.url);
  emit(ctx, preview, () => [`Opening ${preview.url}`]);
}

export async function rollback(ctx: Ctx): Promise<void> {
  const name = requireArg(ctx, 0, "preview name", "rollback <name> [--to <deploymentId>]");
  const view = await (await makeClient(ctx)).rollback(name, ctx.args.to);
  emit(ctx, view, () => [`Rolled back ${view.name} to ${view.deployment?.id ?? "?"}: ${view.url}`]);
}

export async function remove(ctx: Ctx): Promise<void> {
  const name = requireArg(ctx, 0, "preview name", "rm <name>");
  await (await makeClient(ctx)).remove(name);
  emit(ctx, { deleted: name }, () => [`Deleted ${name}`]);
}
