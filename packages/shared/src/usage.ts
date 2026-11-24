// SPDX-License-Identifier: MIT

import { z } from "zod";
import { Scope } from "./api-keys";
import { Quotas } from "./quotas";

export const KeyUsage = z.object({
  id: z.string(),
  label: z.string(),
  scopes: z.array(Scope),
  lastUsedAt: z.string().datetime().nullable(),
  deployments: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});
export type KeyUsage = z.infer<typeof KeyUsage>;

export const Usage = z.object({
  totals: z.object({
    previews: z.number().int().nonnegative(),
    deployments: z.number().int().nonnegative(),
    storedBytes: z.number().int().nonnegative(),
  }),
  quota: Quotas.extend({ remainingBytes: z.number().int().nonnegative() }),
  keys: z.array(KeyUsage),
});
export type Usage = z.infer<typeof Usage>;
