import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { DatabaseModule } from '@infra/database/database.module';

/**
 * Tasks Module
 * Provides task management services
 */
@Module({
  imports: [DatabaseModule],
  providers: [TaskService],
  exports: [TaskService],
})
export class TasksModule {}
