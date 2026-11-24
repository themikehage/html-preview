// SPDX-License-Identifier: MIT

import { randomBytes } from "node:crypto";
import type { Clock } from "../ports/clock.port";
import type { Ids } from "../ports/ids.port";

export const systemClock: Clock = { now: () => new Date() };

function token(): string {
  return randomBytes(16).toString("base64url");
}

export const randomIds: Ids = {
  previewId: token,
  deploymentId: () => `d_${token()}`,
  apiKeyId: () => `k_${token()}`,
  secret: () => `hp_${randomBytes(32).toString("base64url")}`,
};
