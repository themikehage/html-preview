// SPDX-License-Identifier: MIT

import { z } from "zod";

export const Health = z.object({
  status: z.literal("ok"),
  version: z.string(),
});
export type Health = z.infer<typeof Health>;
