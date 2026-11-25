// SPDX-License-Identifier: MIT

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Clock } from "../ports/clock.port";
import type { DomainDeps } from "../ports/deps";
import type { Ids } from "../ports/ids.port";
import type { Config } from "./config";
import { FsBlobStore } from "./fs-blob-store";
import { loadSigningSecret } from "./signing-secret";
import { SqliteBackup } from "./sqlite/backup";
import { openDatabase } from "./sqlite/db";
import { SqliteDeploymentRepo } from "./sqlite/deployment-repo";
import { SqliteKeyRepo } from "./sqlite/key-repo";
import { SqliteLinkRepo } from "./sqlite/link-repo";
import { SqlitePreviewRepo } from "./sqlite/preview-repo";
import { SqliteTransactor } from "./sqlite/transactor";
import { randomIds, systemClock } from "./system";

export interface ServerContext {
  readonly config: Config;
  readonly version: string;
  readonly deps: DomainDeps;
  close(): void;
}

export interface ContextOverrides {
  clock?: Clock;
  ids?: Ids;
}

export function createServerContext(
  config: Config,
  version: string,
  overrides: ContextOverrides = {},
): ServerContext {
  mkdirSync(config.DATA_DIR, { recursive: true });
  const db = openDatabase(join(config.DATA_DIR, "html-preview.sqlite"));
  const deps: DomainDeps = {
    previews: new SqlitePreviewRepo(db),
    deployments: new SqliteDeploymentRepo(db),
    keys: new SqliteKeyRepo(db),
    links: new SqliteLinkRepo(db),
    blobs: new FsBlobStore(join(config.DATA_DIR, "blobs")),
    backup: new SqliteBackup(db, join(config.DATA_DIR, "backups")),
    clock: overrides.clock ?? systemClock,
    ids: overrides.ids ?? randomIds,
    tx: new SqliteTransactor(db),
    defaultTtlHours: config.DEFAULT_TTL_HOURS,
    maxVisibility: config.MAX_VISIBILITY,
    quotas: {
      maxDeployBytes: config.MAX_DEPLOY_BYTES,
      maxDeployFiles: config.MAX_DEPLOY_FILES,
      maxTotalBytes: config.MAX_TOTAL_BYTES,
      keepDeployments: config.KEEP_DEPLOYMENTS,
    },
    contentMode: config.CONTENT_MODE,
    contentOrigin: config.CONTENT_ORIGIN,
    signingSecret: loadSigningSecret(config),
  };
  return { config, version, deps, close: () => db.close() };
}
