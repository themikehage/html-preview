// SPDX-License-Identifier: MIT

export type BlobSource = Uint8Array | ReadableStream<Uint8Array>;

export interface StoredBlob {
  hash: string;
  size: number;
  modifiedAt: Date;
}

export interface BlobStore {
  has(hash: string): Promise<boolean>;
  put(source: BlobSource, expectedHash: string): Promise<void>;
  open(hash: string): Promise<Blob | null>;
  list(): AsyncIterable<StoredBlob>;
  delete(hash: string): Promise<void>;
  /** Removes abandoned partial uploads older than `before`. */
  cleanTemp(before: Date): Promise<number>;
}
