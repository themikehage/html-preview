// SPDX-License-Identifier: MIT

import { zValidator } from "@hono/zod-validator";
import {
  ListPreviewsQuery,
  NameParam,
  type PreviewDetail,
  type PreviewList,
  RollbackRequest,
  UpdatePreviewRequest,
} from "@html-preview/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../core/infra/auth";
import type { ServerContext } from "../../core/infra/server-context";
import { deletePreview } from "../../domain/delete";
import { updatePreview } from "../../domain/preview-admin";
import { getPreview, listPreviews } from "../../domain/queries";
import { rollback } from "../../domain/rollback";
import { invalid } from "../validate";
import { toDeploymentView, toPreviewView } from "./views";

export function manageCrud(ctx: ServerContext): Hono<AppEnv> {
  const { config, deps } = ctx;
  const router = new Hono<AppEnv>();

  router.get("/", zValidator("query", ListPreviewsQuery, invalid("query")), (c) => {
    const listing = listPreviews(deps, c.req.valid("query"));
    const body: PreviewList = {
      previews: listing.items.map((item) => toPreviewView(config, item.preview, item.deployment)),
      nextCursor: listing.nextCursor,
    };
    return c.json(body);
  });

  router.get("/:name", zValidator("param", NameParam, invalid("path parameter")), (c) => {
    const { preview, deployments } = getPreview(deps, c.req.valid("param").name);
    const current = deployments.find((item) => item.id === preview.currentDeploymentId) ?? null;
    const body: PreviewDetail = {
      preview: toPreviewView(config, preview, current),
      deployments: deployments.map((item) => toDeploymentView(config, preview, item)),
    };
    return c.json(body);
  });

  router.patch(
    "/:name",
    zValidator("param", NameParam, invalid("path parameter")),
    zValidator("json", UpdatePreviewRequest, invalid("body")),
    (c) => {
      const body = c.req.valid("json");
      const preview = updatePreview(deps, {
        name: c.req.valid("param").name,
        ...(body.visibility ? { visibility: body.visibility } : {}),
        ...(body.ttl !== undefined ? { ttlHours: body.ttl } : {}),
        ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
        ...(body.name ? { newName: body.name } : {}),
      });
      const current = preview.currentDeploymentId
        ? deps.deployments.findSummary(preview.currentDeploymentId)
        : null;
      return c.json(toPreviewView(config, preview, current));
    },
  );

  router.post(
    "/:name/rollback",
    zValidator("param", NameParam, invalid("path parameter")),
    zValidator("json", RollbackRequest, invalid("body")),
    (c) => {
      const { deploymentId } = c.req.valid("json");
      const result = rollback(deps, {
        name: c.req.valid("param").name,
        ...(deploymentId ? { deploymentId } : {}),
      });
      return c.json(toPreviewView(config, result.preview, result.deployment));
    },
  );

  router.delete("/:name", zValidator("param", NameParam, invalid("path parameter")), (c) => {
    deletePreview(deps, c.req.valid("param").name);
    return c.body(null, 204);
  });

  return router;
}
