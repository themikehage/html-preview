// SPDX-License-Identifier: MIT

import { afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../core/infra/config";
import { type ServerContext, createServerContext } from "../core/infra/server-context";
import type { Clock } from "../core/ports/clock.port";

export class FakeClock implements Clock {
  constructor(private current = new Date("2026-01-01T00:00:00.000Z")) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export interface TestContext {
  ctx: ServerContext;
  clock: FakeClock;
  dataDir: string;
}

export function useTestContext(env: Record<string, string> = {}): () => TestContext {
  const created: TestContext[] = [];
  afterEach(() => {
    for (const item of created.splice(0)) {
      item.ctx.close();
      rmSync(item.dataDir, { recursive: true, force: true });
    }
  });
  return () => {
    const dataDir = mkdtempSync(join(tmpdir(), "html-preview-test-"));
    const clock = new FakeClock();
    const ctx = createServerContext(loadConfig({ DATA_DIR: dataDir, ...env }), "test", { clock });
    const item = { ctx, clock, dataDir };
    created.push(item);
    return item;
  };
}

export async function sha256Hex(content: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(content);
  return hasher.digest("hex");
}
