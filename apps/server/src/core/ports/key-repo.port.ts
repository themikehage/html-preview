// SPDX-License-Identifier: MIT

import type { ApiKey, Scope } from "@html-preview/shared";

export interface StoredApiKey extends ApiKey {
  hash: string;
}

export interface KeyRepo {
  create(key: StoredApiKey): void;
  findByHash(hash: string): StoredApiKey | null;
  touch(id: string, at: string): void;
  count(): number;
}

export type { Scope };
