// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { ErrorBody, Health } from "@html-preview/shared";
import { buildFetchHandler, loadConfig } from "./server";

const handler = buildFetchHandler(loadConfig({}), "9.9.9");

function get(host: string, path: string): Promise<Response> {
  return Promise.resolve(handler(new Request(`http://${host}${path}`, { headers: { host } })));
}

describe("host dispatch", () => {
  test("GET /healthz answers on the app host", async () => {
    const res = await get("localhost:3000", "/healthz");
    expect(res.status).toBe(200);
    expect(Health.parse(await res.json())).toEqual({ status: "ok", version: "9.9.9" });
  });

  test("GET /healthz answers on the content host", async () => {
    const res = await get("127.0.0.1:3000", "/healthz");
    expect(res.status).toBe(200);
  });

  test("content host answers 404 for anything else", async () => {
    const res = await get("127.0.0.1:3000", "/abc/index.html");
    expect(res.status).toBe(404);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("not_found");
  });

  test("app host answers typed 404", async () => {
    const res = await get("localhost:3000", "/nope");
    expect(res.status).toBe(404);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("not_found");
  });

  test("unknown host answers 421 with a fix hint", async () => {
    const res = await get("evil.test", "/healthz");
    expect(res.status).toBe(421);
    const body = ErrorBody.parse(await res.json());
    expect(body.error.code).toBe("unknown_host");
    expect(body.error.fix).toBeDefined();
  });
});
