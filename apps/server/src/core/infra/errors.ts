// SPDX-License-Identifier: MIT

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fix?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequest extends AppError {
  constructor(message: string, fix?: string, code = "bad_request") {
    super(400, code, message, fix);
  }
}

export class Unauthorized extends AppError {
  constructor(message = "Authentication required", fix?: string, code = "unauthorized") {
    super(401, code, message, fix);
  }
}

export class Forbidden extends AppError {
  constructor(message = "Not allowed", fix?: string, code = "forbidden") {
    super(403, code, message, fix);
  }
}

export class NotFound extends AppError {
  constructor(message = "Not found", fix?: string, code = "not_found") {
    super(404, code, message, fix);
  }
}

export class Conflict extends AppError {
  constructor(message: string, fix?: string, code = "conflict") {
    super(409, code, message, fix);
  }
}

export class PayloadTooLarge extends AppError {
  constructor(message: string, fix?: string, code = "payload_too_large") {
    super(413, code, message, fix);
  }
}

export class MisdirectedRequest extends AppError {
  constructor(message = "Unknown host", fix?: string, code = "unknown_host") {
    super(421, code, message, fix);
  }
}

export class TooManyRequests extends AppError {
  constructor(message = "Too many requests", fix?: string, code = "rate_limited") {
    super(429, code, message, fix);
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal server error", code = "internal_error") {
    super(500, code, message);
  }
}
