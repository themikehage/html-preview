// SPDX-License-Identifier: MIT

import { createContentApp } from "./content/router";
import { toErrorResponse } from "./core/infra/error-handler";
import { dispatchByHost } from "./core/infra/host-dispatch";
import type { ServerContext } from "./core/infra/server-context";
import { createApp } from "./routes/app";

export function buildFetchHandler(ctx: ServerContext) {
  const dispatch = dispatchByHost(ctx.config, {
    app: createApp(ctx),
    content: createContentApp(ctx),
  });
  return async (request: Request): Promise<Response> => {
    try {
      return await dispatch(request);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
