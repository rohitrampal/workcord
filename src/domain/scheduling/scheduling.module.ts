import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { ReminderService } from './reminder.service';
import { DatabaseModule } from '@infra/database/database.module';
import { DiscordModule } from '@infra/discord/discord.module';
import { WfmModule } from '@domain/wfm/wfm.module';
import { AuditModule } from '@domain/audit/audit.module';
import { HrmsModule } from '@domain/hrms/hrms.module';
import { TasksModule } from '@domain/tasks/tasks.module';

/**
 * Scheduling Module
 * Provides scheduled tasks and reminders
 */
@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, DiscordModule, WfmModule, AuditModule, HrmsModule, TasksModule],
  providers: [SchedulerService, ReminderService],
  exports: [SchedulerService, ReminderService],
})
export class SchedulingModule {}
