import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TasksResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 15 })
  count: number;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'task-123' },
        guildId: { type: 'string', example: 'guild-456' },
        assigneeId: { type: 'string', example: 'user-789' },
        creatorId: { type: 'string', example: 'user-101' },
        title: { type: 'string', example: 'Complete feature implementation' },
        description: { type: 'string', nullable: true },
        status: {
          type: 'string',
          enum: ['Not Started', 'In Progress', 'Blocked', 'Completed', 'Cancelled'],
          example: 'In Progress',
        },
        priority: { type: 'string', enum: ['Low', 'Normal', 'High', 'Critical'], example: 'High' },
        dueDate: { type: 'string', format: 'date-time', nullable: true },
        assignee: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
          },
        },
        creator: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
          },
        },
      },
    },
  })
  data: any[];
}

export class TasksQueryDto {
  @ApiPropertyOptional({ description: 'Filter by guild ID', example: 'guild-456' })
  guildId?: string;

  @ApiPropertyOptional({ description: 'Filter by assignee ID', example: 'user-789' })
  assigneeId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['Not Started', 'In Progress', 'Blocked', 'Completed', 'Cancelled'],
    example: 'In Progress',
  })
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by priority',
    enum: ['Low', 'Normal', 'High', 'Critical'],
    example: 'High',
  })
  priority?: string;
}

export class TaskByIdResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string', example: 'task-123' },
      guildId: { type: 'string', example: 'guild-456' },
      assigneeId: { type: 'string', example: 'user-789' },
      creatorId: { type: 'string', example: 'user-101' },
      title: { type: 'string' },
      description: { type: 'string', nullable: true },
      status: { type: 'string', enum: ['Not Started', 'In Progress', 'Blocked', 'Completed', 'Cancelled'] },
      priority: { type: 'string', enum: ['Low', 'Normal', 'High', 'Critical'] },
      dueDate: { type: 'string', format: 'date-time', nullable: true },
      assignee: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
        },
      },
      creator: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
        },
      },
    },
  })
  data: any;
}
