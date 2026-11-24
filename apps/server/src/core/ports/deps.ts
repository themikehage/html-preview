// SPDX-License-Identifier: MIT

import type { Visibility } from "@html-preview/shared";
import type { BlobStore } from "./blob-store.port";
import type { Clock } from "./clock.port";
import type { DeploymentRepo } from "./deployment-repo.port";
import type { Ids } from "./ids.port";
import type { KeyRepo } from "./key-repo.port";
import type { PreviewRepo } from "./preview-repo.port";
import type { Transactor } from "./transactor.port";

export interface DomainDeps {
  readonly previews: PreviewRepo;
  readonly deployments: DeploymentRepo;
  readonly keys: KeyRepo;
  readonly blobs: BlobStore;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly tx: Transactor;
  readonly defaultTtlHours: number;
  readonly maxVisibility: Visibility;
}
