// SPDX-License-Identifier: MIT

import { z } from "zod";

export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/, "must be a lowercase hex SHA-256");
export type Sha256 = z.infer<typeof Sha256>;

export const ManifestFileInput = z.object({
  hash: Sha256,
  size: z.number().int().nonnegative(),
});
export type ManifestFileInput = z.infer<typeof ManifestFileInput>;

export const ManifestInput = z
  .record(z.string().min(1), ManifestFileInput)
  .refine((files) => Object.keys(files).length > 0, "manifest must contain at least one file");
export type ManifestInput = z.infer<typeof ManifestInput>;

export const ManifestFile = ManifestFileInput.extend({ contentType: z.string() });
export type ManifestFile = z.infer<typeof ManifestFile>;

export const Manifest = z.record(z.string(), ManifestFile);
export type Manifest = z.infer<typeof Manifest>;
