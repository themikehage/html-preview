// SPDX-License-Identifier: MIT

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Everything the CLI touches in the outside world, so tests can replace it. */
export interface Runtime {
  env: Record<string, string | undefined>;
  cwd: string;
  /** Directory that holds config.json. */
  configDir: string;
  fetch: FetchLike;
  sleep(ms: number): Promise<void>;
  out(text: string): void;
  err(text: string): void;
  openUrl(url: string): Promise<void>;
  /** Resolves when the user asks to stop (Ctrl-C). */
  stopSignal: AbortSignal;
}
