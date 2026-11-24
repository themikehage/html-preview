// SPDX-License-Identifier: MIT

import { z } from "zod";

export const WarningCode = z.enum([
  "ROOT_RELATIVE_URL",
  "NO_ENTRY_HTML",
  "LOCALHOST_URL",
  "MIXED_CONTENT",
  "LARGE_FILE",
]);
export type WarningCode = z.infer<typeof WarningCode>;

export const DeployWarning = z.object({
  code: WarningCode,
  file: z.string().optional(),
  fix: z.string(),
});
export type DeployWarning = z.infer<typeof DeployWarning>;
