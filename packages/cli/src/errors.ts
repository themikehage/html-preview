// SPDX-License-Identifier: MIT

export const EXIT = { ok: 0, usage: 1, api: 2, network: 3 } as const;

export interface ErrorPayload {
  error: { code: string; message: string; fix?: string };
}

/** Bad flags, missing arguments or missing credentials. Exit code 1. */
export class UsageError extends Error {
  constructor(
    message: string,
    readonly fix?: string,
    readonly code = "USAGE",
  ) {
    super(message);
  }
}

/** The server answered with an error. Exit code 2. `body` is the server's body verbatim. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorPayload,
  ) {
    super(body.error.message);
  }
}

/** The server could not be reached. Exit code 3. */
export class NetworkError extends Error {
  readonly fix = "Check the URL (html-preview login --url <url>) and that the server is reachable";
}

export function exitCodeOf(error: unknown): number {
  if (error instanceof UsageError) return EXIT.usage;
  if (error instanceof ApiError) return EXIT.api;
  if (error instanceof NetworkError) return EXIT.network;
  return EXIT.api;
}

export function payloadOf(error: unknown): ErrorPayload {
  if (error instanceof ApiError) return error.body;
  if (error instanceof UsageError) {
    return { error: { code: error.code, message: error.message, fix: error.fix } };
  }
  if (error instanceof NetworkError) {
    return { error: { code: "NETWORK_ERROR", message: error.message, fix: error.fix } };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { error: { code: "CLI_ERROR", message } };
}
