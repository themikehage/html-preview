// SPDX-License-Identifier: MIT

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fix?: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequest extends AppError {
  constructor(message: string, fix?: string, code = "BAD_REQUEST") {
    super(400, code, message, fix);
  }
}

export class Unauthorized extends AppError {
  constructor(message = "Authentication required", fix?: string, code = "UNAUTHORIZED") {
    super(401, code, message, fix);
  }
}

export class Forbidden extends AppError {
  constructor(message = "Not allowed", fix?: string, code = "FORBIDDEN") {
    super(403, code, message, fix);
  }
}

export class NotFound extends AppError {
  constructor(message = "Not found", fix?: string, code = "NOT_FOUND") {
    super(404, code, message, fix);
  }
}

export class Conflict extends AppError {
  constructor(message: string, fix?: string, code = "CONFLICT") {
    super(409, code, message, fix);
  }
}

export class PayloadTooLarge extends AppError {
  constructor(message: string, fix?: string, code = "PAYLOAD_TOO_LARGE") {
    super(413, code, message, fix);
  }
}

export class UnsupportedMediaType extends AppError {
  constructor(message: string, fix?: string, code = "UNSUPPORTED_MEDIA_TYPE") {
    super(415, code, message, fix);
  }
}

export class MisdirectedRequest extends AppError {
  constructor(message = "Unknown host", fix?: string, code = "UNKNOWN_HOST") {
    super(421, code, message, fix);
  }
}

export class TooManyRequests extends AppError {
  constructor(retryAfterSeconds: number, message = "Too many requests", fix?: string) {
    super(429, "RATE_LIMITED", message, fix, { "Retry-After": String(retryAfterSeconds) });
  }
}

export class InsufficientScope extends AppError {
  constructor(required: string) {
    super(
      403,
      "INSUFFICIENT_SCOPE",
      `This API key lacks the "${required}" scope`,
      `Use a key with the "${required}" (or "admin") scope; an admin can create one with POST /v1/keys`,
    );
  }
}

export class MethodNotAllowed extends AppError {
  constructor(allow: string, fix?: string) {
    super(405, "METHOD_NOT_ALLOWED", `Method not allowed; use ${allow}`, fix, { Allow: allow });
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal server error", code = "INTERNAL_ERROR") {
    super(500, code, message);
  }
}
