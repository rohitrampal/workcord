import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttendanceResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 10 })
  count: number;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'attendance-123' },
        guildId: { type: 'string', example: 'guild-456' },
        userId: { type: 'string', example: 'user-789' },
        date: { type: 'string', format: 'date-time', example: '2024-01-15T00:00:00.000Z' },
        checkInTime: { type: 'string', format: 'date-time', example: '2024-01-15T09:00:00.000Z' },
        checkOutTime: { type: 'string', format: 'date-time', nullable: true, example: '2024-01-15T17:00:00.000Z' },
        location: { type: 'string', example: 'Office' },
        totalHours: { type: 'number', nullable: true, example: 8.0 },
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

export class AttendanceQueryDto {
  @ApiPropertyOptional({ description: 'Filter by guild ID', example: 'guild-456' })
  guildId?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID', example: 'user-789' })
  userId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO format)', example: '2024-01-01' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO format)', example: '2024-12-31' })
  endDate?: string;
}

export class AttendanceByIdResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string', example: 'attendance-123' },
      guildId: { type: 'string', example: 'guild-456' },
      userId: { type: 'string', example: 'user-789' },
      date: { type: 'string', format: 'date-time' },
      checkInTime: { type: 'string', format: 'date-time' },
      checkOutTime: { type: 'string', format: 'date-time', nullable: true },
      location: { type: 'string', example: 'Office' },
      totalHours: { type: 'number', nullable: true },
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

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 'Attendance record not found' })
  error: string;
}
