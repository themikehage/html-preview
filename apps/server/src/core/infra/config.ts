// SPDX-License-Identifier: MIT

import { z } from "zod";

const origin = z
  .string()
  .url()
  .transform((value) => new URL(value).origin);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().min(1).default("./data"),
  APP_ORIGIN: origin.default("http://localhost:3000"),
  CONTENT_ORIGIN: origin.default("http://127.0.0.1:3000"),
  CONTENT_MODE: z.enum(["path", "subdomain"]).default("path"),
  ADMIN_PASSWORD: z.string().min(1).optional(),
  MAX_VISIBILITY: z.enum(["unlisted", "private", "public"]).default("unlisted"),
  DEFAULT_TTL_HOURS: z.coerce.number().int().min(0).default(168),
  MAX_DEPLOY_BYTES: z.coerce.number().int().positive().default(52_428_800),
  MAX_DEPLOY_FILES: z.coerce.number().int().positive().default(2000),
  MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(5_368_709_120),
  KEEP_DEPLOYMENTS: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(0).default(120),
  FRAME_ANCESTORS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
});

export type Config = z.infer<typeof schema>;

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`),
    );
  }
  const config = parsed.data;
  const sameHost = new URL(config.APP_ORIGIN).host === new URL(config.CONTENT_ORIGIN).host;
  if (config.NODE_ENV === "production" && sameHost) {
    throw new ConfigError([
      "APP_ORIGIN and CONTENT_ORIGIN must use different hosts in production (untrusted content must never share an origin with the API)",
    ]);
  }
  return config;
}
