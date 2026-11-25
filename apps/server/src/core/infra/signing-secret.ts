// SPDX-License-Identifier: MIT

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config";

const SECRET_FILE = "signing-secret";

/** `SIGNING_SECRET` wins; otherwise a random secret persisted in `DATA_DIR` (mode 0600). */
export function loadSigningSecret(config: Pick<Config, "SIGNING_SECRET" | "DATA_DIR">): string {
  if (config.SIGNING_SECRET) return config.SIGNING_SECRET;
  const file = join(config.DATA_DIR, SECRET_FILE);
  if (existsSync(file)) {
    const stored = readFileSync(file, "utf8").trim();
    if (stored.length >= 32) return stored;
  }
  const secret = randomBytes(32).toString("hex");
  writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return secret;
}
