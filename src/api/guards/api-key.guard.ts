import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * API Key Guard
 * Simple API key authentication for REST endpoints
 * API key should be provided in X-API-Key header
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    // Get API key from environment variable
    const validApiKey = process.env.API_KEY || 'praxio-default-key-change-in-production';

    // Allow health check endpoint without authentication
    if (request.url === '/health') {
      return true;
    }

    if (!apiKey || apiKey !== validApiKey) {
      throw new UnauthorizedException('Invalid or missing API key. Provide X-API-Key header.');
    }

    return true;
  }
}
