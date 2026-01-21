import { Logger } from '@nestjs/common';

/**
 * Custom error classes for PraXio
 */

export class PraXioError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'PraXioError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends PraXioError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends PraXioError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class PermissionError extends PraXioError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'PERMISSION_ERROR', 403);
    this.name = 'PermissionError';
  }
}

export class ConflictError extends PraXioError {
  constructor(message: string) {
    super(message, 'CONFLICT_ERROR', 409);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends PraXioError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_ERROR', 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Error handler utility
 */
export function handleError(error: unknown, logger: Logger): string {
  if (error instanceof PraXioError) {
    logger.warn(`PraXio Error: ${error.message}`, error.stack);
    return error.message;
  }

  if (error instanceof Error) {
    logger.error(`Unexpected error: ${error.message}`, error.stack);
    return 'An unexpected error occurred. Please try again later.';
  }

  logger.error('Unknown error occurred', error);
  return 'An unknown error occurred. Please contact support.';
}
