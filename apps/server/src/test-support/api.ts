// SPDX-License-Identifier: MIT

import { gzipSync } from "fflate";
import { createApiKey } from "../domain/api-keys";
import { buildFetchHandler } from "../server";
import { type TestContext, useTestContext } from "./context";

export const APP_HOST = "localhost:3000";
export const CONTENT_HOST = "127.0.0.1:3000";

type RequestBody = NonNullable<ConstructorParameters<typeof Response>[0]>;

export interface CallOptions {
  body?: RequestBody | object;
  headers?: Record<string, string>;
  key?: string | null;
  host?: string;
}

export interface Api extends TestContext {
  key: string;
  call(method: string, path: string, options?: CallOptions): Promise<Response>;
  content(path: string, options?: CallOptions & { method?: string }): Promise<Response>;
  json<T>(response: Response): Promise<T>;
}

export function useApi(env: Record<string, string> = {}): () => Api {
  const make = useTestContext(env);
  return () => {
    const base = make();
    const handler = buildFetchHandler(base.ctx);
    const { key } = createApiKey(base.ctx.deps, "tester", ["admin", "deploy", "read"]);
    const call: Api["call"] = (method, path, options = {}) => {
      const host = options.host ?? APP_HOST;
      const headers = new Headers(options.headers);
      headers.set("host", host);
      const token = options.key === undefined ? key : options.key;
      if (token) headers.set("authorization", `Bearer ${token}`);
      let body: RequestBody | undefined;
      const raw = options.body;
      if (raw !== undefined) {
        const isPlain = typeof raw === "object" && raw.constructor === Object;
        if (isPlain) headers.set("content-type", "application/json");
        body = isPlain ? JSON.stringify(raw) : (raw as RequestBody);
      }
      return handler(new Request(`http://${host}${path}`, { method, headers, body }));
    };
    return {
      ...base,
      key,
      call,
      content: (path, options = {}) =>
        call(options.method ?? "GET", path, { ...options, host: CONTENT_HOST, key: null }),
      json: async <T>(response: Response) => (await response.json()) as T,
    };
  };
}

function octal(value: number, length: number): string {
  return `${value.toString(8).padStart(length - 1, "0")}\0`;
}

export function makeTarGz(
  files: Record<string, string>,
  extra: { symlink?: string } = {},
): Uint8Array {
  const encoder = new TextEncoder();
  const blocks: Uint8Array[] = [];
  const entry = (name: string, content: Uint8Array, type: string): void => {
    const header = new Uint8Array(512);
    header.set(encoder.encode(name.slice(0, 100)), 0);
    header.set(encoder.encode(octal(0o644, 8)), 100);
    header.set(encoder.encode(octal(content.length, 12)), 124);
    header.set(encoder.encode(type), 156);
    header.set(encoder.encode("ustar\0"), 257);
    header.set(encoder.encode("        "), 148);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.set(encoder.encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
    blocks.push(header);
    const padded = new Uint8Array(Math.ceil(content.length / 512) * 512);
    padded.set(content);
    blocks.push(padded);
  };
  for (const [name, content] of Object.entries(files)) entry(name, encoder.encode(content), "0");
  if (extra.symlink) entry(extra.symlink, new Uint8Array(), "2");
  blocks.push(new Uint8Array(1024));
  const tar = new Uint8Array(blocks.reduce((total, block) => total + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    tar.set(block, offset);
    offset += block.length;
  }
  return gzipSync(tar);
}
