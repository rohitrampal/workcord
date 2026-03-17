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
  TasksResponseDto,
  TasksQueryDto,
  TaskByIdResponseDto,
} from '../dto/tasks.dto';
import { ErrorResponseDto } from '../dto/attendance.dto';

/**
 * Tasks Controller
 * REST API endpoints for task data
 */
@ApiTags('tasks')
@ApiSecurity('ApiKeyAuth')
@Controller('api/tasks')
@UseGuards(ApiKeyGuard)
export class TasksController {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /api/tasks
   * Get task records with optional filters
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get task records',
    description: 'Retrieve task records with optional filtering by guild, assignee, status, and priority',
  })
  @ApiQuery({ name: 'guildId', required: false, description: 'Filter by guild ID' })
  @ApiQuery({ name: 'assigneeId', required: false, description: 'Filter by assignee ID' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['Not Started', 'In Progress', 'Blocked', 'Completed', 'Cancelled'],
    description: 'Filter by task status',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    enum: ['Low', 'Normal', 'High', 'Critical'],
    description: 'Filter by task priority',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved task records',
    type: TasksResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing API key' })
  async getTasks(@Query() query: TasksQueryDto) {
    const { guildId, assigneeId, status, priority } = query;
    const where: any = {};

    if (guildId) where.guildId = guildId;
    if (assigneeId) where.assigneeId = assigneeId;
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const records = await this.prisma.task.findMany({
      where,
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
          },
        },
        creator: {
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
   * GET /api/tasks/:id
   * Get a specific task record
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get task record by ID',
    description: 'Retrieve a specific task record by its unique identifier',
  })
  @ApiParam({ name: 'id', description: 'Task record ID', example: 'task-123' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved task record',
    type: TaskByIdResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing API key' })
  @ApiResponse({ status: 404, description: 'Task record not found', type: ErrorResponseDto })
  async getTaskById(@Param('id') id: string) {
    const record = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
          },
        },
        creator: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException({ success: false, error: 'Task record not found' });
    }

    return {
      success: true,
      data: record,
    };
  }
}
