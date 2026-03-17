import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', description: 'Service health status' })
  status: string;

  @ApiProperty({
    example: '2024-01-25T18:00:00.000Z',
    description: 'Current server timestamp',
  })
  timestamp: string;
}
