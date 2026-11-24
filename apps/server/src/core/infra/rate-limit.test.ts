// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { FakeClock } from "../../test-support/context";
import { TokenBucketLimiter } from "./rate-limit";

describe("TokenBucketLimiter", () => {
  test("allows a burst, then refuses with a retry hint, then refills", () => {
    const clock = new FakeClock();
    const limiter = new TokenBucketLimiter(60, clock);
    for (let i = 0; i < 60; i++) expect(limiter.take("k").allowed).toBe(true);
    const refused = limiter.take("k");
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 1 });
    clock.advance(1);
    expect(limiter.take("k").allowed).toBe(true);
    expect(limiter.take("k").allowed).toBe(false);
  });

  test("buckets are independent and never exceed capacity", () => {
    const clock = new FakeClock();
    const limiter = new TokenBucketLimiter(2, clock);
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(false);
    expect(limiter.take("b").allowed).toBe(true);
    clock.advance(3600);
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(false);
  });

  test("a limit of 0 disables limiting", () => {
    const limiter = new TokenBucketLimiter(0, new FakeClock());
    for (let i = 0; i < 1000; i++) expect(limiter.take("k").allowed).toBe(true);
  });
});
