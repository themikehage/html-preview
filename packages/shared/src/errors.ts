// SPDX-License-Identifier: MIT

import { z } from "zod";

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fix: z.string().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
