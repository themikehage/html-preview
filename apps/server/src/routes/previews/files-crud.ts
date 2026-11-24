// SPDX-License-Identifier: MIT

import { zValidator } from "@hono/zod-validator";
import { FilesQuery, NameParam } from "@html-preview/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../core/infra/auth";
import { NotFound } from "../../core/infra/errors";
import type { ServerContext } from "../../core/infra/server-context";
import { listFiles, readFile } from "../../domain/files";
import { invalid } from "../validate";

const TEXT_TYPE = /^(text\/|application\/(json|javascript|xml)|image\/svg\+xml)/;

function pathAfterFiles(url: string): string {
  const pathname = new URL(url).pathname;
  const raw = pathname.slice(pathname.indexOf("/files/") + "/files/".length);
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new NotFound("File not found", "Use a valid, URL-encoded file path", "FILE_NOT_FOUND");
  }
}

export function filesCrud(ctx: ServerContext): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.get(
    "/:name/files",
    zValidator("param", NameParam, invalid("path parameter")),
    zValidator("query", FilesQuery, invalid("query")),
    (c) => {
      const { deployment, files } = listFiles(ctx.deps, {
        name: c.req.valid("param").name,
        ...(c.req.valid("query").deployment
          ? { deploymentId: c.req.valid("query").deployment }
          : {}),
      });
      return c.json({ deploymentId: deployment.id, entry: deployment.entry, files });
    },
  );

  router.get(
    "/:name/files/*",
    zValidator("param", NameParam, invalid("path parameter")),
    zValidator("query", FilesQuery, invalid("query")),
    async (c) => {
      const query = c.req.valid("query");
      const { file, blob } = await readFile(ctx.deps, {
        name: c.req.valid("param").name,
        path: pathAfterFiles(c.req.url),
        ...(query.deployment ? { deploymentId: query.deployment } : {}),
      });
      return new Response(blob, {
        headers: {
          "Content-Type": TEXT_TYPE.test(file.contentType)
            ? "text/plain; charset=utf-8"
            : "application/octet-stream",
          "X-Original-Content-Type": file.contentType,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox",
          "Cache-Control": "no-store",
          ETag: `"${file.hash}"`,
        },
      });
    },
  );
  return router;
}
