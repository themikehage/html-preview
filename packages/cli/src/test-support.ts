// SPDX-License-Identifier: MIT

import { afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildFetchHandler } from "../../../apps/server/src/server";
import { type Api, useApi } from "../../../apps/server/src/test-support/api";
import { runCli } from "./cli";
import type { FetchLike, Runtime } from "./runtime";

export const URL_BASE = "http://localhost:3000";

export interface Harness {
  api: Api;
  rt: Runtime;
  home: string;
  stdout: string[];
  stderr: string[];
  sleeps: number[];
  opened: string[];
  stop: AbortController;
  write(path: string, content: string): void;
  run(...argv: string[]): Promise<number>;
  /** Last JSON document printed on stdout. */
  json<T = Record<string, unknown>>(): T;
}

export function useCli(
  env: Record<string, string> = {},
  wrapFetch: (inner: FetchLike) => FetchLike = (inner) => inner,
): () => Harness {
  const makeApi = useApi(env);
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  return () => {
    const api = makeApi();
    const handler = buildFetchHandler(api.ctx);
    const home = mkdtempSync(join(tmpdir(), "html-preview-cli-"));
    dirs.push(home);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const sleeps: number[] = [];
    const opened: string[] = [];
    const stop = new AbortController();
    const rt: Runtime = {
      env: { HTML_PREVIEW_URL: URL_BASE, HTML_PREVIEW_KEY: api.key },
      cwd: home,
      configDir: join(home, ".config", "html-preview"),
      fetch: wrapFetch((input, init) => Promise.resolve(handler(new Request(input, init)))),
      sleep: async (ms) => void sleeps.push(ms),
      out: (text) => void stdout.push(text),
      err: (text) => void stderr.push(text),
      openUrl: async (url) => void opened.push(url),
      stopSignal: stop.signal,
    };
    const harness: Harness = {
      api,
      rt,
      home,
      stdout,
      stderr,
      sleeps,
      opened,
      stop,
      write(path, content) {
        const abs = join(home, path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      },
      run: (...argv) => runCli(argv, rt, "0.0.0-test"),
      json: <T>() => JSON.parse(stdout.at(-1) ?? "null") as T,
    };
    return harness;
  };
}
