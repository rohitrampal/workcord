import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LeavesResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 5 })
  count: number;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'leave-123' },
        guildId: { type: 'string', example: 'guild-456' },
        userId: { type: 'string', example: 'user-789' },
        leaveType: { type: 'string', example: 'Sick Leave' },
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        reason: { type: 'string', example: 'Sick' },
        status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'], example: 'Pending' },
        user: {
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

export class LeavesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by guild ID', example: 'guild-456' })
  guildId?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID', example: 'user-789' })
  userId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['Pending', 'Approved', 'Rejected'],
    example: 'Pending',
  })
  status?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO format)', example: '2024-01-01' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO format)', example: '2024-12-31' })
  endDate?: string;
}

export class LeaveByIdResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string', example: 'leave-123' },
      guildId: { type: 'string', example: 'guild-456' },
      userId: { type: 'string', example: 'user-789' },
      leaveType: { type: 'string', example: 'Sick Leave' },
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      reason: { type: 'string' },
      status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] },
      user: {
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
