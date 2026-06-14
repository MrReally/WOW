// Domain-level errors mapped to HTTP responses in app.ts.

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const NotFound = (entity: string, id?: string) =>
  new AppError("not_found", id ? `${entity} ${id} not found` : `${entity} not found`, 404);

export const BadRequest = (message: string, details?: unknown) =>
  new AppError("bad_request", message, 400, details);

export const Unauthorized = (message = "unauthorized") =>
  new AppError("unauthorized", message, 401);

export const Forbidden = (message = "forbidden") =>
  new AppError("forbidden", message, 403);

export const Conflict = (message: string, details?: unknown) =>
  new AppError("conflict", message, 409, details);
