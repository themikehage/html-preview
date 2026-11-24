// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { ConfigError, loadConfig } from "./config";

describe("loadConfig", () => {
  test("applies dev defaults", () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.APP_ORIGIN).toBe("http://localhost:3000");
    expect(config.CONTENT_ORIGIN).toBe("http://127.0.0.1:3000");
    expect(config.CONTENT_MODE).toBe("path");
    expect(config.FRAME_ANCESTORS).toEqual([]);
  });

  test("rejects invalid values with readable issues", () => {
    expect(() => loadConfig({ PORT: "abc", CONTENT_MODE: "x" })).toThrow(ConfigError);
    try {
      loadConfig({ PORT: "abc" });
    } catch (error) {
      expect((error as ConfigError).message).toContain("PORT");
    }
  });

  test("treats empty strings as unset", () => {
    expect(loadConfig({ PORT: "" }).PORT).toBe(3000);
  });

  test("refuses shared host in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        APP_ORIGIN: "https://a.x",
        CONTENT_ORIGIN: "https://a.x",
      }),
    ).toThrow(/different hosts/);
  });

  test("accepts distinct hosts in production", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      APP_ORIGIN: "https://a.x",
      CONTENT_ORIGIN: "https://p.x",
    });
    expect(config.CONTENT_ORIGIN).toBe("https://p.x");
  });

  test("parses FRAME_ANCESTORS list", () => {
    expect(loadConfig({ FRAME_ANCESTORS: "https://a.x, https://b.x" }).FRAME_ANCESTORS).toEqual([
      "https://a.x",
      "https://b.x",
    ]);
  });
});
