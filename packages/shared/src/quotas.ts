// SPDX-License-Identifier: MIT

import { z } from "zod";

export const Quotas = z.object({
  maxDeployBytes: z.number().int().positive(),
  maxDeployFiles: z.number().int().positive(),
  maxTotalBytes: z.number().int().positive(),
  keepDeployments: z.number().int().positive(),
});
export type Quotas = z.infer<typeof Quotas>;
