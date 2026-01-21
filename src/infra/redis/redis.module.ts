import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Global Redis Module
 * Provides RedisService to all modules
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
