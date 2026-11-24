// SPDX-License-Identifier: MIT

import type { ErrorBody } from "@html-preview/shared";
import { HTTPException } from "hono/http-exception";
import { AppError, BadRequest, InternalError } from "./errors";

function classify(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof HTTPException && error.status === 400) {
    return new BadRequest(error.message, "Check the request body syntax");
  }
  console.error(error);
  return new InternalError();
}

export function toErrorResponse(error: unknown): Response {
  const appError = classify(error);
  const body: ErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.fix ? { fix: appError.fix } : {}),
    },
  };
  return Response.json(body, { status: appError.status });
}
