// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { isIgnored, parseIgnore } from "./ignore";
import { slugify } from "./scan";

const ignored = (rules: string, path: string, isDir = false) =>
  isIgnored(parseIgnore(rules), path, isDir);

describe("parseIgnore (H6-A3)", () => {
  test("basename patterns match at any depth", () => {
    expect(ignored("*.map", "a/b/app.js.map")).toBe(true);
    expect(ignored("*.map", "app.js")).toBe(false);
  });

  test("slash anchors a pattern to the root", () => {
    expect(ignored("/drafts", "drafts", true)).toBe(true);
    expect(ignored("/drafts", "x/drafts", true)).toBe(false);
    expect(ignored("a/b.txt", "a/b.txt")).toBe(true);
    expect(ignored("a/b.txt", "x/a/b.txt")).toBe(false);
  });

  test("trailing slash matches directories only", () => {
    expect(ignored("tmp/", "tmp", true)).toBe(true);
    expect(ignored("tmp/", "tmp", false)).toBe(false);
  });

  test("** crosses directories; * and ? do not", () => {
    expect(ignored("docs/**/*.psd", "docs/a/b/c.psd")).toBe(true);
    expect(ignored("docs/*.psd", "docs/a/c.psd")).toBe(false);
    expect(ignored("a?.txt", "ab.txt")).toBe(true);
    expect(ignored("a?.txt", "a/.txt")).toBe(false);
  });

  test("negation re-includes, last match wins; comments and blanks are skipped", () => {
    const rules = "# note\n\n*.log\n!keep.log\n";
    expect(ignored(rules, "a.log")).toBe(true);
    expect(ignored(rules, "keep.log")).toBe(false);
  });

  test("character classes and regex metacharacters in names", () => {
    expect(ignored("file[0-9].txt", "file7.txt")).toBe(true);
    expect(ignored("a+b.txt", "a+b.txt")).toBe(true);
    expect(ignored("a+b.txt", "aab.txt")).toBe(false);
  });
});

describe("slugify", () => {
  test("lowercases, collapses separators and trims hyphens", () => {
    expect(slugify("My Site_v2")).toBe("my-site-v2");
    expect(slugify("--Hello World--")).toBe("hello-world");
    expect(slugify("日本")).toBe("");
    expect(slugify("a".repeat(80))).toHaveLength(63);
  });
});
