import { Module } from '@nestjs/common';
import { ConfigModule } from '@shared/config/config.module';
import { DatabaseModule } from '@infra/database/database.module';
import { RedisModule } from '@infra/redis/redis.module';

/**
 * API Module
 * REST API for webhooks and external integrations
 */
@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule],
  controllers: [],
  providers: [],
})
export class ApiModule {}
