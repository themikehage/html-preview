// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, test } from "bun:test";
import { ErrorBody, Health } from "@html-preview/shared";
import { buildFetchHandler } from "./server";
import { useTestContext } from "./test-support/context";

const make = useTestContext();
let handler: (request: Request) => Promise<Response>;

beforeEach(() => {
  handler = buildFetchHandler(make().ctx);
});

function get(host: string, path: string): Promise<Response> {
  return Promise.resolve(handler(new Request(`http://${host}${path}`, { headers: { host } })));
}

describe("host dispatch", () => {
  test("GET /healthz answers on the app host", async () => {
    const res = await get("localhost:3000", "/healthz");
    expect(res.status).toBe(200);
    expect(Health.parse(await res.json())).toEqual({ status: "ok", version: "test" });
  });

  test("GET /healthz answers on the content host", async () => {
    const res = await get("127.0.0.1:3000", "/healthz");
    expect(res.status).toBe(200);
  });

  test("content host answers a plain 404 for unknown previews", async () => {
    const res = await get("127.0.0.1:3000", "/abc/index.html");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("Not found");
  });

  test("app host answers typed 404", async () => {
    const res = await get("localhost:3000", "/nope");
    expect(res.status).toBe(404);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("NOT_FOUND");
  });

  test("unknown host answers 421 with a fix hint", async () => {
    const res = await get("evil.test", "/healthz");
    expect(res.status).toBe(421);
    const body = ErrorBody.parse(await res.json());
    expect(body.error.code).toBe("UNKNOWN_HOST");
    expect(body.error.fix).toBeDefined();
  });
});
