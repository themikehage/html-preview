// SPDX-License-Identifier: MIT

import type { Clock } from "../ports/clock.port";

export interface RateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const IDLE_EVICT_MS = 600_000;

/** In-memory token bucket per subject. `perMinute` is both the burst size and the refill rate. */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(
    private readonly perMinute: number,
    private readonly clock: Clock,
  ) {}

  take(subject: string): RateDecision {
    if (this.perMinute <= 0) return { allowed: true, retryAfterSeconds: 0 };
    const now = this.clock.now().getTime();
    this.sweep(now);
    const refillPerMs = this.perMinute / 60_000;
    const bucket = this.buckets.get(subject) ?? { tokens: this.perMinute, updatedAt: now };
    bucket.tokens = Math.min(
      this.perMinute,
      bucket.tokens + Math.max(0, now - bucket.updatedAt) * refillPerMs,
    );
    bucket.updatedAt = now;
    this.buckets.set(subject, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs / 1000)),
    };
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < IDLE_EVICT_MS) return;
    this.lastSweep = now;
    for (const [subject, bucket] of this.buckets) {
      if (now - bucket.updatedAt > IDLE_EVICT_MS) this.buckets.delete(subject);
    }
  }
}
