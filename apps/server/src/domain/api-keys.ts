// SPDX-License-Identifier: MIT

import type { ApiKey, Scope } from "@html-preview/shared";
import { Conflict, NotFound, Unauthorized } from "../core/infra/errors";
import type { DomainDeps } from "../core/ports/deps";
import type { StoredApiKey } from "../core/ports/key-repo.port";
import { sha256Hex } from "./hash";

const TOUCH_INTERVAL_MS = 60_000;

export interface CreatedApiKey {
  key: string;
  record: ApiKey;
}

function toPublic({ hash: _hash, ...record }: StoredApiKey): ApiKey {
  return record;
}

export function createApiKey(deps: DomainDeps, label: string, scopes: Scope[]): CreatedApiKey {
  const key = deps.ids.secret();
  const stored: StoredApiKey = {
    id: deps.ids.apiKeyId(),
    label,
    hash: sha256Hex(key),
    scopes,
    createdAt: deps.clock.now().toISOString(),
    lastUsedAt: null,
  };
  deps.keys.create(stored);
  return { key, record: toPublic(stored) };
}

export function hasScope(key: ApiKey, scope: Scope): boolean {
  return key.scopes.includes(scope) || key.scopes.includes("admin");
}

export function listApiKeys(deps: DomainDeps): ApiKey[] {
  return deps.keys.list().map(toPublic);
}

export function revokeApiKey(deps: DomainDeps, id: string): void {
  const target = deps.keys.findById(id);
  if (!target)
    throw new NotFound(`API key "${id}" not found`, "List keys with GET /v1/keys", "KEY_NOT_FOUND");
  const otherAdmins = deps.keys
    .list()
    .filter((key) => key.id !== id && key.scopes.includes("admin"));
  if (target.scopes.includes("admin") && otherAdmins.length === 0) {
    throw new Conflict(
      "Refusing to revoke the last admin key",
      "Create another admin key first with POST /v1/keys",
      "LAST_ADMIN_KEY",
    );
  }
  deps.keys.delete(id);
}

export function bootstrapAdminKey(deps: DomainDeps): string | null {
  if (deps.keys.count() > 0) return null;
  return createApiKey(deps, "bootstrap-admin", ["admin", "deploy", "read"]).key;
}

export function authenticate(deps: DomainDeps, header: string | undefined): ApiKey {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  const stored = match?.[1] ? deps.keys.findByHash(sha256Hex(match[1])) : null;
  if (!stored) {
    throw new Unauthorized(
      "Missing or invalid API key",
      "Send 'Authorization: Bearer <api key>'; the bootstrap key is printed once on first boot",
    );
  }
  const now = deps.clock.now();
  const last = stored.lastUsedAt ? Date.parse(stored.lastUsedAt) : 0;
  if (now.getTime() - last > TOUCH_INTERVAL_MS) deps.keys.touch(stored.id, now.toISOString());
  return toPublic(stored);
}
