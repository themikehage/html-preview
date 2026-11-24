// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { startScheduler } from "./scheduler";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("scheduler", () => {
  test("runs immediately and on every interval until stopped", async () => {
    let runs = 0;
    const scheduler = startScheduler([
      {
        name: "t",
        everyMs: 10,
        run: async () => {
          runs += 1;
        },
      },
    ]);
    await sleep(55);
    scheduler.stop();
    const seen = runs;
    expect(seen).toBeGreaterThanOrEqual(3);
    await sleep(40);
    expect(runs).toBe(seen);
  });

  test("never overlaps a task with itself and survives failures", async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const errors: string[] = [];
    const scheduler = startScheduler(
      [
        {
          name: "slow",
          everyMs: 5,
          run: async () => {
            calls += 1;
            active += 1;
            maxActive = Math.max(maxActive, active);
            await sleep(20);
            active -= 1;
            if (calls === 1) throw new Error("boom");
          },
        },
      ],
      (message) => errors.push(message),
    );
    await sleep(80);
    scheduler.stop();
    expect(maxActive).toBe(1);
    expect(calls).toBeGreaterThan(1);
    expect(errors).toEqual(['scheduled task "slow" failed']);
  });
});
