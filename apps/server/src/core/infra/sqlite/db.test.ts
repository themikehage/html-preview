// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { useTestContext } from "../../../test-support/context";
import { openDatabase } from "./db";
import { LATEST_SCHEMA_VERSION } from "./migrations";

const make = useTestContext();

describe("openDatabase", () => {
  test("creates the schema, enables WAL and foreign keys, and is idempotent", () => {
    const { dataDir } = make();
    const file = join(dataDir, "second.sqlite");
    const db = openDatabase(file);
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    expect(tables).toEqual([
      "api_keys",
      "deployment_files",
      "deployments",
      "previews",
      "share_links",
    ]);
    expect(db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode).toBe(
      "wal",
    );
    expect(db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()?.foreign_keys).toBe(
      1,
    );
    db.close();
    const reopened = openDatabase(file);
    expect(
      reopened.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version,
    ).toBe(LATEST_SCHEMA_VERSION);
    reopened.close();
  });

  test("foreign keys reject deployments of unknown previews", () => {
    const db = openDatabase(":memory:");
    expect(() =>
      db
        .query(
          "INSERT INTO deployments (id, preview_id, entry, bytes, file_count, status, created_by, created_at) VALUES ('d','x','index.html',1,1,'ready','t','now')",
        )
        .run(),
    ).toThrow();
    db.close();
  });
});
