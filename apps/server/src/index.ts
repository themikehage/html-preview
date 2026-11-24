// SPDX-License-Identifier: MIT

import pkg from "../package.json";
import { ConfigError, loadConfig } from "./core/infra/config";
import { startScheduler } from "./core/infra/scheduler";
import { createServerContext } from "./core/infra/server-context";
import { bootstrapAdminKey } from "./domain/api-keys";
import { runReaper } from "./domain/reaper";
import { buildFetchHandler } from "./server";

const REAPER_INTERVAL_MS = 10 * 60_000;

function main(): void {
  try {
    const config = loadConfig(process.env);
    const ctx = createServerContext(config, pkg.version);
    const bootstrapKey = bootstrapAdminKey(ctx.deps);
    if (bootstrapKey)
      console.log(`Bootstrap admin API key (shown once, store it now): ${bootstrapKey}`);
    const server = Bun.serve({ port: config.PORT, fetch: buildFetchHandler(ctx) });
    const scheduler = startScheduler([
      {
        name: "reaper",
        everyMs: REAPER_INTERVAL_MS,
        run: async () => {
          const report = await runReaper(ctx.deps);
          const changed = Object.values(report).some((count) => count > 0);
          if (changed) console.log("reaper", JSON.stringify(report));
        },
      },
    ]);
    const shutdown = (): void => {
      scheduler.stop();
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
