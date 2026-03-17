import { Module } from '@nestjs/common';
import { ConfigModule } from '@shared/config/config.module';
import { DatabaseModule } from '@infra/database/database.module';
import { RedisModule } from '@infra/redis/redis.module';
import { AttendanceController } from './controllers/attendance.controller';
import { LeavesController } from './controllers/leaves.controller';
import { TasksController } from './controllers/tasks.controller';
import { UsersController } from './controllers/users.controller';
import { HealthController } from './controllers/health.controller';
import { ApiKeyGuard } from './guards/api-key.guard';

/**
 * API Module
 * REST API for webhooks and external integrations
 */
@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule],
  controllers: [
    AttendanceController,
    LeavesController,
    TasksController,
    UsersController,
    HealthController,
  ],
  providers: [ApiKeyGuard],
})
export class ApiModule {}
