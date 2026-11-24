// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { AppError } from "../core/infra/errors";
import { normalizeManifest, normalizeManifestPath, resolveEntry } from "./manifest-path";

const hash = "a".repeat(64);

describe("normalizeManifestPath", () => {
  test("normalizes redundant segments", () => {
    expect(normalizeManifestPath("./assets//app.js")).toBe("assets/app.js");
  });

  test.each([
    ["/etc/passwd"],
    ["../x.html"],
    ["a/../b.html"],
    ["a\\b.html"],
    ["a\0b.html"],
    [".git/config"],
    ["dir/.env"],
    [""],
    ["./"],
  ])("rejects %j", (raw) => {
    try {
      normalizeManifestPath(raw);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_PATH");
      expect((error as AppError).status).toBe(400);
    }
  });
});

describe("normalizeManifest", () => {
  test("adds content types", () => {
    const manifest = normalizeManifest({ "index.html": { hash, size: 1 } });
    expect(manifest["index.html"]?.contentType).toContain("text/html");
  });

  test("rejects paths that collide after normalization", () => {
    expect(() =>
      normalizeManifest({ "a.html": { hash, size: 1 }, "./a.html": { hash, size: 1 } }),
    ).toThrow(/duplicates/);
  });
});

describe("resolveEntry", () => {
  const manifest = normalizeManifest({ "index.html": { hash, size: 1 } });

  test("defaults to index.html", () => {
    expect(resolveEntry(manifest, undefined)).toBe("index.html");
  });

  test("fails when the entry is not in the manifest", () => {
    expect(() => resolveEntry(manifest, "home.html")).toThrow(/not part of the manifest/);
  });
});
