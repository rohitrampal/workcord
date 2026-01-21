import { Module } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { DatabaseModule } from '@infra/database/database.module';
import { HrmsModule } from '@domain/hrms/hrms.module';
import { TasksModule } from '@domain/tasks/tasks.module';
import { WfmModule } from '@domain/wfm/wfm.module';

/**
 * Reporting Module
 * Provides reporting and analytics services
 */
@Module({
  imports: [DatabaseModule, HrmsModule, TasksModule, WfmModule],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
