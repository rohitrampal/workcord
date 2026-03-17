import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UsersResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 25 })
  count: number;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'user-123' },
        guildId: { type: 'string', example: 'guild-456' },
        username: { type: 'string', example: 'john_doe' },
        discriminator: { type: 'string', example: '0001' },
        displayName: { type: 'string', nullable: true, example: 'John Doe' },
        isActive: { type: 'boolean', example: true },
        penaltyPoints: { type: 'number', example: 0 },
        role: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          nullable: true,
        },
      },
    },
  })
  data: any[];
}

export class UsersQueryDto {
  @ApiPropertyOptional({ description: 'Filter by guild ID', example: 'guild-456' })
  guildId?: string;

  @ApiPropertyOptional({ description: 'Filter by active status', example: 'true' })
  isActive?: string;
}

export class UserByIdResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string', example: 'user-123' },
      guildId: { type: 'string', example: 'guild-456' },
      username: { type: 'string', example: 'john_doe' },
      discriminator: { type: 'string', example: '0001' },
      displayName: { type: 'string', nullable: true },
      isActive: { type: 'boolean' },
      penaltyPoints: { type: 'number' },
      role: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        nullable: true,
      },
    },
  })
  data: any;
}
