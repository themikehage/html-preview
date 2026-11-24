// SPDX-License-Identifier: MIT

import { z } from "zod";
import { DeployWarning } from "./warnings";

export const DeployResponse = z.object({
  url: z.string().url(),
  deploymentUrl: z.string().url(),
  name: z.string(),
  deploymentId: z.string(),
  created: z.boolean(),
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  uploaded: z.number().int().nonnegative(),
  expiresAt: z.string().datetime().nullable(),
  warnings: z.array(DeployWarning),
});
export type DeployResponse = z.infer<typeof DeployResponse>;
