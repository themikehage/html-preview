// SPDX-License-Identifier: MIT

import { CreateLinkRequest, type Visibility } from "@html-preview/shared";
import { Visibility as VisibilitySchema } from "@html-preview/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { AppError, NotFound } from "../core/infra/errors";
import type { ServerContext } from "../core/infra/server-context";
import { deletePreview } from "../domain/delete";
import { findFavicon } from "../domain/favicon";
import { createLink, listLinks, revokeLink } from "../domain/links";
import { requirePreview, updatePreview } from "../domain/preview-admin";
import { getPreview, listPreviews } from "../domain/queries";
import { rollback } from "../domain/rollback";
import { effectiveVisibility } from "../domain/visibility";
import type { DashEnv } from "./env";
import { contentUrlFor } from "./frame";
import { DetailPage, type DetailProps } from "./pages/detail";
import { PreviewsPage } from "./pages/previews";

const PAGE_SIZE = 25;
const ORDER: Visibility[] = ["private", "unlisted", "public"];

type Flash = Pick<DetailProps, "error" | "notice" | "createdLink">;

async function renderDetail(
  c: Context<DashEnv>,
  ctx: ServerContext,
  name: string,
  flash: Flash = {},
  status: 200 | 201 | 400 | 404 | 409 = 200,
) {
  const { deps } = ctx;
  const { preview, deployments } = getPreview(deps, name);
  const effective = effectiveVisibility(preview.visibility, deps.maxVisibility);
  const ceiling = ORDER.indexOf(deps.maxVisibility);
  const props: DetailProps = {
    csrf: c.get("csrf"),
    preview,
    effective,
    allowed: ORDER.filter((_, index) => index <= ceiling),
    deployments,
    links: listLinks(deps, name),
    now: deps.clock.now(),
    frameSrc: preview.currentDeploymentId ? contentUrlFor(deps, preview) : null,
    ...flash,
  };
  return c.html(<DetailPage {...props} />, status);
}

function field(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

/** Runs a mutation; domain errors re-render the page with the message, never a blank 500. */
async function mutate(
  c: Context<DashEnv>,
  ctx: ServerContext,
  name: string,
  run: () => Flash | Promise<Flash>,
  created: 200 | 201 = 200,
) {
  try {
    return await renderDetail(c, ctx, name, await run(), created);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (error.status === 404) throw error;
    return renderDetail(
      c,
      ctx,
      name,
      { error: `${error.message}${error.fix ? `. ${error.fix}` : ""}` },
      400,
    );
  }
}

export function previewRoutes(ctx: ServerContext): Hono<DashEnv> {
  const { deps } = ctx;
  const router = new Hono<DashEnv>();

  router.get("/", async (c) => {
    const q = c.req.query("q")?.trim().slice(0, 100) ?? "";
    const by = c.req.query("by") ?? "";
    const after = c.req.query("after") ?? "";
    const listing = listPreviews(deps, {
      ...(q ? { q } : {}),
      ...(by ? { createdBy: by } : {}),
      ...(after ? { cursor: after } : {}),
      limit: PAGE_SIZE,
    });
    const rows = await Promise.all(
      listing.items.map(async ({ preview, deployment }) => ({
        preview,
        deployment,
        hasFavicon: (await findFavicon(deps, preview)) !== null,
      })),
    );
    const labels = [...new Set(deps.keys.list().map((key) => key.label))].sort();
    return c.html(
      <PreviewsPage
        csrf={c.get("csrf")}
        rows={rows}
        q={q}
        createdBy={by}
        labels={labels}
        nextCursor={listing.nextCursor}
      />,
    );
  });

  router.get("/previews/:name", (c) => renderDetail(c, ctx, c.req.param("name")));

  router.get("/previews/:name/open", (c) => {
    const preview = requirePreview(deps, c.req.param("name"));
    const deploymentId = c.req.query("deployment");
    if (deploymentId) {
      const deployment = deps.deployments.findSummary(deploymentId);
      if (!deployment || deployment.previewId !== preview.id || deployment.status !== "ready") {
        throw new NotFound(
          `Deployment "${deploymentId}" not found`,
          undefined,
          "DEPLOYMENT_NOT_FOUND",
        );
      }
    }
    return c.redirect(contentUrlFor(deps, preview, deploymentId), 302);
  });

  router.get("/previews/:name/favicon", async (c) => {
    const icon = await findFavicon(deps, requirePreview(deps, c.req.param("name")));
    if (!icon) throw new NotFound("No favicon", undefined, "FILE_NOT_FOUND");
    return new Response(icon.bytes, {
      headers: {
        "Content-Type": icon.contentType,
        // Untrusted bytes on the app origin: sandboxed so an SVG can never run script here.
        "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=60",
      },
    });
  });

  router.post("/previews/:name/settings", async (c) => {
    const name = c.req.param("name");
    const body = await c.req.parseBody();
    return mutate(c, ctx, name, () => {
      const visibility = VisibilitySchema.safeParse(field(body, "visibility"));
      const ttlRaw = field(body, "ttl").trim();
      updatePreview(deps, {
        name,
        ...(visibility.success ? { visibility: visibility.data } : {}),
        ...(ttlRaw !== "" ? { ttlHours: Number(ttlRaw) } : {}),
        pinned: field(body, "pinned") === "1",
        spa: field(body, "spa") === "1",
      });
      return { notice: "Settings saved." };
    });
  });

  router.post("/previews/:name/rollback", async (c) => {
    const name = c.req.param("name");
    const body = await c.req.parseBody();
    return mutate(c, ctx, name, () => {
      rollback(deps, { name, deploymentId: field(body, "deploymentId") });
      return { notice: "Rolled back." };
    });
  });

  router.post("/previews/:name/links", async (c) => {
    const name = c.req.param("name");
    const body = await c.req.parseBody();
    return mutate(
      c,
      ctx,
      name,
      () => {
        const parsed = CreateLinkRequest.safeParse({
          expiresInHours: Number(field(body, "expiresInHours") || 168),
          ...(field(body, "label").trim() ? { label: field(body, "label") } : {}),
        });
        if (!parsed.success)
          return { error: "Expiry must be a whole number of hours from 1 to 720." };
        const { link, url } = createLink(deps, {
          name,
          expiresInHours: parsed.data.expiresInHours,
          label: parsed.data.label,
          createdBy: "dashboard",
        });
        return { createdLink: { url, label: link.label } };
      },
      201,
    );
  });

  router.post("/previews/:name/links/:id/revoke", (c) =>
    mutate(c, ctx, c.req.param("name"), () => {
      revokeLink(deps, c.req.param("name"), c.req.param("id"));
      return { notice: "Link revoked." };
    }),
  );

  router.post("/previews/:name/delete", (c) => {
    deletePreview(deps, c.req.param("name"));
    return c.redirect("/dashboard", 303);
  });

  return router;
}
