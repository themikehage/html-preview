// SPDX-License-Identifier: MIT

import type { ErrorBody } from "@html-preview/shared";
import { AppError, InternalError } from "./errors";

export function toErrorResponse(error: unknown): Response {
  if (!(error instanceof AppError)) console.error(error);
  const appError = error instanceof AppError ? error : new InternalError();
  const body: ErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.fix ? { fix: appError.fix } : {}),
    },
  };
  return Response.json(body, { status: appError.status });
}
