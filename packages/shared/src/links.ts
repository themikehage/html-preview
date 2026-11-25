// SPDX-License-Identifier: MIT

import { z } from "zod";
import { PreviewName } from "./preview";

export const MAX_ACTIVE_LINKS = 20;
export const LINK_MIN_HOURS = 1;
export const LINK_MAX_HOURS = 24 * 30;
export const LINK_DEFAULT_HOURS = 24 * 7;

export const CreateLinkRequest = z.object({
  expiresInHours: z
    .number()
    .int()
    .min(LINK_MIN_HOURS)
    .max(LINK_MAX_HOURS)
    .default(LINK_DEFAULT_HOURS)
    .describe("Hours until the link stops working (1 to 720, default 168)"),
  label: z.string().trim().min(1).max(100).optional().describe("Who or what the link is for"),
});
export type CreateLinkRequest = z.infer<typeof CreateLinkRequest>;

export const LinkView = z.object({
  id: z.string(),
  label: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  accessCount: z.number().int().nonnegative(),
  lastAccessedAt: z.string().datetime().nullable(),
});
export type LinkView = z.infer<typeof LinkView>;

/** The only response that ever carries the secret URL. */
export const CreatedLink = LinkView.extend({ url: z.string().url() });
export type CreatedLink = z.infer<typeof CreatedLink>;

export const LinkList = z.object({ links: z.array(LinkView) });
export type LinkList = z.infer<typeof LinkList>;

export const LinkParam = z.object({ name: PreviewName, id: z.string().min(1) });
