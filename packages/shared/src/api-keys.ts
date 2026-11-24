// SPDX-License-Identifier: MIT

import { z } from "zod";

export const Scope = z.enum(["deploy", "read", "admin"]);
export type Scope = z.infer<typeof Scope>;

export const ApiKey = z.object({
  id: z.string(),
  label: z.string().min(1),
  scopes: z.array(Scope).min(1),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
});
export type ApiKey = z.infer<typeof ApiKey>;

export const CreateKeyRequest = z.object({
  label: z.string().trim().min(1).max(100),
  scopes: z
    .array(Scope)
    .min(1)
    .transform((scopes) => [...new Set(scopes)]),
});
export type CreateKeyRequest = z.infer<typeof CreateKeyRequest>;

/** The only response that ever carries the secret token. */
export const CreatedKey = ApiKey.extend({ key: z.string() });
export type CreatedKey = z.infer<typeof CreatedKey>;

export const KeyList = z.object({ keys: z.array(ApiKey) });
export type KeyList = z.infer<typeof KeyList>;

export const KeyParam = z.object({ id: z.string().min(1) });
