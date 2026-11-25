// SPDX-License-Identifier: MIT

import { z } from "zod";

export const PreviewName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "must match ^[a-z0-9][a-z0-9-]{0,62}$");
export type PreviewName = z.infer<typeof PreviewName>;

export const Visibility = z.enum(["unlisted", "private", "public"]);
export type Visibility = z.infer<typeof Visibility>;

export const Preview = z.object({
  id: z.string().length(22),
  name: PreviewName,
  visibility: Visibility,
  expiresAt: z.string().datetime().nullable(),
  pinned: z.boolean(),
  /** Unknown paths without a file extension serve the entry page (history fallback). */
  spa: z.boolean(),
  currentDeploymentId: z.string().nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Preview = z.infer<typeof Preview>;
