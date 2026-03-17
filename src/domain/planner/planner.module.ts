import { Module } from '@nestjs/common';
import { PlannerService } from './planner.service';
import { DatabaseModule } from '@infra/database/database.module';
import { TasksModule } from '@domain/tasks/tasks.module';

/**
 * Planner Module
 * Provides sprint and OKR management services
 */
@Module({
  imports: [DatabaseModule, TasksModule],
  providers: [PlannerService],
  exports: [PlannerService],
})
export class PlannerModule {}
