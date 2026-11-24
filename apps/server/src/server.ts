// SPDX-License-Identifier: MIT

import { createContentApp } from "./content/app";
import { type Config, loadConfig } from "./core/infra/config";
import { toErrorResponse } from "./core/infra/error-handler";
import { dispatchByHost } from "./core/infra/host-dispatch";
import { createServerContext } from "./core/infra/server-context";
import { createApp } from "./routes/app";

export function buildFetchHandler(config: Config, version: string) {
  const ctx = createServerContext(config, version);
  const dispatch = dispatchByHost(config, {
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

export { loadConfig };
