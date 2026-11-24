// SPDX-License-Identifier: MIT

import { BadRequest } from "../core/infra/errors";

interface Failure {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}

export function invalid(target: string) {
  return (result: Failure): void => {
    if (result.success) return;
    const issue = result.error?.issues[0];
    const where = issue?.path.map(String).join(".");
    throw new BadRequest(
      `Invalid ${target}${where ? ` "${where}"` : ""}: ${issue?.message ?? "invalid value"}`,
      `Fix the ${target} and retry`,
      "INVALID_REQUEST",
    );
  };
}
