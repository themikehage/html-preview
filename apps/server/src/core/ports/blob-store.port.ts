// SPDX-License-Identifier: MIT

export type BlobSource = Uint8Array | ReadableStream<Uint8Array>;

export interface BlobStore {
  has(hash: string): Promise<boolean>;
  put(source: BlobSource, expectedHash: string): Promise<void>;
  open(hash: string): Promise<Blob | null>;
}
