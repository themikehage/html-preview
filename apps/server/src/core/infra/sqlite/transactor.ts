// SPDX-License-Identifier: MIT

import type { Database } from "bun:sqlite";
import type { Transactor } from "../../ports/transactor.port";

export class SqliteTransactor implements Transactor {
  constructor(private readonly db: Database) {}

  run<T>(work: () => T): T {
    return this.db.transaction(work)();
  }
}
