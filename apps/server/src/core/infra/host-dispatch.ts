// SPDX-License-Identifier: MIT

import type { Config } from "./config";
import { MisdirectedRequest } from "./errors";

export interface HostApp {
  fetch(request: Request): Response | Promise<Response>;
}

export interface HostApps {
  app: HostApp;
  content: HostApp;
}

export function dispatchByHost(
  config: Pick<Config, "APP_ORIGIN" | "CONTENT_ORIGIN" | "CONTENT_MODE">,
  apps: HostApps,
): (request: Request) => Response | Promise<Response> {
  const appHost = new URL(config.APP_ORIGIN).host.toLowerCase();
  const contentHost = new URL(config.CONTENT_ORIGIN).host.toLowerCase();
  return (request) => {
    const host = (request.headers.get("host") ?? new URL(request.url).host).toLowerCase();
    if (host === appHost) return apps.app.fetch(request);
    if (host === contentHost) return apps.content.fetch(request);
    if (config.CONTENT_MODE === "subdomain" && host.endsWith(`.${contentHost}`)) {
      return apps.content.fetch(request);
    }
    throw new MisdirectedRequest(
      `Host "${host}" is not served here`,
      `Use ${config.APP_ORIGIN} for the API or ${config.CONTENT_ORIGIN} for preview content${config.CONTENT_MODE === "subdomain" ? " (previews live on <label>.<content host>)" : ""}`,
    );
  };
}
