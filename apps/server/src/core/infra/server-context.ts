// SPDX-License-Identifier: MIT

import type { Config } from "./config";

export interface ServerContext {
  readonly config: Config;
  readonly version: string;
}

export function createServerContext(config: Config, version: string): ServerContext {
  return { config, version };
}
