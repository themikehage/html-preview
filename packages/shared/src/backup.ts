// SPDX-License-Identifier: MIT

import { z } from "zod";

export const BackupResult = z.object({
  /** File name under DATA_DIR/backups. */
  name: z.string(),
  bytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type BackupResult = z.infer<typeof BackupResult>;
