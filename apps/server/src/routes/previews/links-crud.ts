// SPDX-License-Identifier: MIT

import { zValidator } from "@hono/zod-validator";
import {
  CreateLinkRequest,
  type CreatedLink,
  type LinkList,
  LinkParam,
  NameParam,
} from "@html-preview/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../core/infra/auth";
import type { ServerContext } from "../../core/infra/server-context";
import { createLink, listLinks, revokeLink } from "../../domain/links";
import { invalid } from "../validate";
import { toLinkView } from "./views";

export function linksCrud(ctx: ServerContext): Hono<AppEnv> {
  const { deps } = ctx;
  const router = new Hono<AppEnv>();

  router.get("/:name/links", zValidator("param", NameParam, invalid("path parameter")), (c) => {
    const body: LinkList = { links: listLinks(deps, c.req.valid("param").name).map(toLinkView) };
    return c.json(body);
  });

  router.post(
    "/:name/links",
    zValidator("param", NameParam, invalid("path parameter")),
    zValidator("json", CreateLinkRequest, invalid("body")),
    (c) => {
      const body = c.req.valid("json");
      const { link, url } = createLink(deps, {
        name: c.req.valid("param").name,
        expiresInHours: body.expiresInHours,
        label: body.label,
        createdBy: c.get("apiKey").label,
      });
      const created: CreatedLink = { ...toLinkView(link), url };
      return c.json(created, 201);
    },
  );

  router.delete(
    "/:name/links/:id",
    zValidator("param", LinkParam, invalid("path parameter")),
    (c) => {
      const { name, id } = c.req.valid("param");
      revokeLink(deps, name, id);
      return c.body(null, 204);
    },
  );

  return router;
}
