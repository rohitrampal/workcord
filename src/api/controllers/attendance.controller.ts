import { Controller, Get, Query, Param, UseGuards, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiSecurity,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PrismaService } from '@infra/database/prisma.service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import {
  AttendanceResponseDto,
  AttendanceQueryDto,
  AttendanceByIdResponseDto,
  ErrorResponseDto,
} from '../dto/attendance.dto';

/**
 * Attendance Controller
 * REST API endpoints for attendance data
 */
@ApiTags('attendance')
@ApiSecurity('ApiKeyAuth')
@Controller('api/attendance')
@UseGuards(ApiKeyGuard)
export class AttendanceController {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /api/attendance
   * Get attendance records with optional filters
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get attendance records',
    description: 'Retrieve attendance records with optional filtering by guild, user, and date range',
  })
  @ApiQuery({ name: 'guildId', required: false, description: 'Filter by guild ID' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO format: YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO format: YYYY-MM-DD)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved attendance records',
    type: AttendanceResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing API key' })
  async getAttendance(
    @Query() query: AttendanceQueryDto,
  ) {
    const { guildId, userId, startDate, endDate } = query;
    const where: any = {};

    if (guildId) where.guildId = guildId;
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const records = await this.prisma.attendance.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 100, // Limit to 100 records
    });

    return {
      success: true,
      count: records.length,
      data: records,
    };
  }

  /**
   * GET /api/attendance/:id
   * Get a specific attendance record
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get attendance record by ID',
    description: 'Retrieve a specific attendance record by its unique identifier',
  })
  @ApiParam({ name: 'id', description: 'Attendance record ID', example: 'attendance-123' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved attendance record',
    type: AttendanceByIdResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing API key' })
  @ApiResponse({ status: 404, description: 'Attendance record not found', type: ErrorResponseDto })
  async getAttendanceById(@Param('id') id: string) {
    const record = await this.prisma.attendance.findUnique({
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
      throw new NotFoundException({ success: false, error: 'Attendance record not found' });
    }

    return {
      success: true,
      data: record,
    };
  }
}
