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
  LeavesResponseDto,
  LeavesQueryDto,
  LeaveByIdResponseDto,
} from '../dto/leaves.dto';
import { ErrorResponseDto } from '../dto/attendance.dto';

/**
 * Leaves Controller
 * REST API endpoints for leave data
 */
@ApiTags('leaves')
@ApiSecurity('ApiKeyAuth')
@Controller('api/leaves')
@UseGuards(ApiKeyGuard)
export class LeavesController {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /api/leaves
   * Get leave records with optional filters
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get leave records',
    description: 'Retrieve leave records with optional filtering by guild, user, status, and date range',
  })
  @ApiQuery({ name: 'guildId', required: false, description: 'Filter by guild ID' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['Pending', 'Approved', 'Rejected'],
    description: 'Filter by leave status',
  })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO format: YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO format: YYYY-MM-DD)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved leave records',
    type: LeavesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing API key' })
  async getLeaves(@Query() query: LeavesQueryDto) {
    const { guildId, userId, status, startDate, endDate } = query;
    const where: any = {};

    if (guildId) where.guildId = guildId;
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) where.startDate.gte = new Date(startDate);
      if (endDate) where.endDate = { lte: new Date(endDate) };
    }

    const records = await this.prisma.leave.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to 100 records
    });

    return {
      success: true,
      count: records.length,
      data: records,
    };
  }

  /**
   * GET /api/leaves/:id
   * Get a specific leave record
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get leave record by ID',
    description: 'Retrieve a specific leave record by its unique identifier',
  })
  @ApiParam({ name: 'id', description: 'Leave record ID', example: 'leave-123' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved leave record',
    type: LeaveByIdResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing API key' })
  @ApiResponse({ status: 404, description: 'Leave record not found', type: ErrorResponseDto })
  async getLeaveById(@Param('id') id: string) {
    const record = await this.prisma.leave.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException({ success: false, error: 'Leave record not found' });
    }

    return {
      success: true,
      data: record,
    };
  }
}
