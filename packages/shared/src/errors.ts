// SPDX-License-Identifier: MIT

import { z } from "zod";

/** Stable error codes. Part of the public contract: add, never rename. */
export const ERROR_CODES = [
  "ALREADY_CURRENT",
  "BAD_REQUEST",
  "BLOBS_MISSING",
  "CONFLICT",
  "DEPLOYMENT_ALREADY_FINAL",
  "DEPLOYMENT_NOT_FOUND",
  "DEPLOY_TOO_LARGE",
  "ENTRY_MISSING",
  "FILE_NOT_FOUND",
  "FORBIDDEN",
  "HASH_MISMATCH",
  "INSTANCE_FULL",
  "INLINE_TOO_LARGE",
  "INSUFFICIENT_SCOPE",
  "INTERNAL_ERROR",
  "INVALID_ACTOR",
  "INVALID_ARCHIVE",
  "INVALID_HASH",
  "INVALID_MANIFEST",
  "INVALID_MESSAGE",
  "INVALID_NAME",
  "INVALID_PATH",
  "INVALID_REQUEST",
  "KEY_NOT_FOUND",
  "LAST_ADMIN_KEY",
  "METHOD_NOT_ALLOWED",
  "NAME_TAKEN",
  "NOT_FOUND",
  "NO_DEPLOYMENT",
  "NO_PREVIOUS_DEPLOYMENT",
  "PAYLOAD_TOO_LARGE",
  "PREVIEW_NOT_FOUND",
  "RATE_LIMITED",
  "TOO_MANY_FILES",
  "UNAUTHORIZED",
  "UNKNOWN_HOST",
  "UNSUPPORTED_MEDIA_TYPE",
  "VISIBILITY_NOT_ALLOWED",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fix: z.string().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
