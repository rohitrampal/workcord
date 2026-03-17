import { Logger } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

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
 * Provides user-friendly error messages for different error types
 */
export function handleError(error: unknown, logger: Logger): string {
  // Handle custom PraXio errors
  if (error instanceof PraXioError) {
    logger.warn(`PraXio Error: ${error.message}`, error.stack);
    return error.message;
  }

  // Handle Prisma errors
  if (error instanceof PrismaClientKnownRequestError) {
    logger.error(`Prisma Error [${error.code}]: ${error.message}`, error.stack);

    // Foreign key constraint violation
    if (error.code === 'P2003') {
      const field = error.meta?.field_name as string;
      if (field?.includes('guildId')) {
        return 'Server setup is incomplete. Please contact an administrator.';
      }
      if (field?.includes('userId')) {
        return 'User profile not found. Please contact an administrator.';
      }
      return 'Database constraint violation. Please try again or contact support.';
    }

    // Unique constraint violation
    if (error.code === 'P2002') {
      const target = error.meta?.target as string[];
      if (target?.includes('guildId') && target?.includes('userId') && target?.includes('date')) {
        return 'You have already checked in today.';
      }
      return 'This record already exists.';
    }

    // Record not found
    if (error.code === 'P2025') {
      const message = error.message;
      if (message.includes('check-in') || message.includes('checkout')) {
        return 'You must check in before checking out. Please use /checkin first.';
      }
      return 'The requested record was not found.';
    }

    // Validation error (e.g., invalid date)
    if (error.code === 'P2009') {
      const message = error.message;
      if (message.includes('Invalid value') && message.includes('Date')) {
        return 'Invalid date format. Please use YYYY-MM-DD format (e.g., 2026-01-25).';
      }
      return 'Invalid data provided. Please check your input and try again.';
    }

    // Generic Prisma error
    return 'A database error occurred. Please try again later.';
  }

  // Handle generic errors
  if (error instanceof Error) {
    // Check for foreign key constraint in error message
    if (error.message.includes('Foreign key constraint') || error.message.includes('violates foreign key constraint')) {
      if (error.message.includes('guildId')) {
        return 'Server setup is incomplete. Please contact an administrator.';
      }
      if (error.message.includes('userId')) {
        return 'User profile not found. Please contact an administrator.';
      }
      return 'Database constraint violation. Please try again or contact support.';
    }

    // Check for invalid date format
    if (error.message.includes('Invalid date format')) {
      return error.message;
    }

    // Check for Prisma validation errors
    if (error.message.includes('Invalid value') && error.message.includes('Date')) {
      return 'Invalid date format. Please use YYYY-MM-DD format (e.g., 2026-01-25).';
    }

    logger.error(`Unexpected error: ${error.message}`, error.stack);
    return 'An unexpected error occurred. Please try again later.';
  }

  logger.error('Unknown error occurred', error);
  return 'An unknown error occurred. Please contact support.';
}
