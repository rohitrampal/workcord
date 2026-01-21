import { Module } from '@nestjs/common';
import { TodoService } from './todo.service';
import { UpdateService } from './update.service';
import { DatabaseModule } from '@infra/database/database.module';

/**
 * WFM Module
 * Provides productivity tracking services (To-Do and EOD updates)
 */
@Module({
  imports: [DatabaseModule],
  providers: [TodoService, UpdateService],
  exports: [TodoService, UpdateService],
})
export class WfmModule {}
