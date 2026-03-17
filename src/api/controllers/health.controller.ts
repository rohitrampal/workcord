import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthResponseDto } from '../dto/health.dto';

/**
 * Health Controller
 * Public health check endpoint
 */
@ApiTags('health')
@Controller()
export class HealthController {
  /**
   * GET /health
   * Health check endpoint (public, no authentication required)
   */
  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Public endpoint to check if the API service is running. No authentication required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    type: HealthResponseDto,
  })
  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
