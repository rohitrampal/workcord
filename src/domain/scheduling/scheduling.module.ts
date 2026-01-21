import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { ReminderService } from './reminder.service';
import { DatabaseModule } from '@infra/database/database.module';
import { DiscordModule } from '@infra/discord/discord.module';
import { WfmModule } from '@domain/wfm/wfm.module';

/**
 * Scheduling Module
 * Provides scheduled tasks and reminders
 */
@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, DiscordModule, WfmModule],
  providers: [SchedulerService, ReminderService],
  exports: [SchedulerService, ReminderService],
})
export class SchedulingModule {}
