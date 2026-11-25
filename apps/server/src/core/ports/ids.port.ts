// SPDX-License-Identifier: MIT

export interface Ids {
  previewId(): string;
  deploymentId(): string;
  apiKeyId(): string;
  secret(): string;
  linkId(): string;
  /** Secret share token; only its SHA-256 is stored. */
  shareToken(): string;
}
