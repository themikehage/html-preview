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
