// SPDX-License-Identifier: MIT

import pkg from "../package.json";
import { ConfigError, loadConfig } from "./core/infra/config";
import { createServerContext } from "./core/infra/server-context";
import { bootstrapAdminKey } from "./domain/api-keys";
import { buildFetchHandler } from "./server";

function main(): void {
  try {
    const config = loadConfig(process.env);
    const ctx = createServerContext(config, pkg.version);
    const bootstrapKey = bootstrapAdminKey(ctx.deps);
    if (bootstrapKey)
      console.log(`Bootstrap admin API key (shown once, store it now): ${bootstrapKey}`);
    const server = Bun.serve({ port: config.PORT, fetch: buildFetchHandler(ctx) });
    const shutdown = (): void => {
      server.stop();
      ctx.close();
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    console.log(`html-preview ${pkg.version} listening on :${config.PORT}`);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

main();
