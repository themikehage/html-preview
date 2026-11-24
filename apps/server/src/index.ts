// SPDX-License-Identifier: MIT

import pkg from "../package.json";
import { ConfigError } from "./core/infra/config";
import { buildFetchHandler, loadConfig } from "./server";

function main(): void {
  try {
    const config = loadConfig(process.env);
    Bun.serve({ port: config.PORT, fetch: buildFetchHandler(config, pkg.version) });
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
