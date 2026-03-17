import { Controller, Get, Query, Param, UseGuards, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiSecurity,
} from '@nestjs/swagger';
import { PrismaService } from '@infra/database/prisma.service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import {
  UsersResponseDto,
  UsersQueryDto,
  UserByIdResponseDto,
} from '../dto/users.dto';
import { ErrorResponseDto } from '../dto/attendance.dto';

/**
 * Users Controller
 * REST API endpoints for user data
 */
@ApiTags('users')
@ApiSecurity('ApiKeyAuth')
@Controller('api/users')
@UseGuards(ApiKeyGuard)
export class UsersController {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /api/users
   * Get user records with optional filters
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get user records',
    description: 'Retrieve user records with optional filtering by guild and active status',
  })
  @ApiQuery({ name: 'guildId', required: false, description: 'Filter by guild ID' })
  @ApiQuery({
    name: 'isActive',
    required: false,
    description: 'Filter by active status (true/false)',
    example: 'true',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved user records',
    type: UsersResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing API key' })
  async getUsers(@Query() query: UsersQueryDto) {
    const { guildId, isActive } = query;
    const where: any = {};

    if (guildId) where.guildId = guildId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const records = await this.prisma.user.findMany({
      where,
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 100, // Limit to 100 records
    });

    return {
      success: true,
      count: records.length,
      data: records,
    };
  }

  /**
   * GET /api/users/:guildId/:id
   * Get a specific user record
   */
  @Get(':guildId/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get user record by ID',
    description: 'Retrieve a specific user record by guild ID and user ID',
  })
  @ApiParam({ name: 'guildId', description: 'Guild ID', example: 'guild-456' })
  @ApiParam({ name: 'id', description: 'User ID', example: 'user-123' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved user record',
    type: UserByIdResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing API key' })
  @ApiResponse({ status: 404, description: 'User record not found', type: ErrorResponseDto })
  async getUserById(@Param('guildId') guildId: string, @Param('id') id: string) {
    const record = await this.prisma.user.findUnique({
      where: { guildId_id: { guildId, id } },
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException({ success: false, error: 'User record not found' });
    }

    return {
      success: true,
      data: record,
    };
  }
}
