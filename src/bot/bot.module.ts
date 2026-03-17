import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { DiscordModule } from '@infra/discord/discord.module';
import { DatabaseModule } from '@infra/database/database.module';
import { ProvisioningModule } from '@domain/provisioning/provisioning.module';
import { HrmsModule } from '@domain/hrms/hrms.module';
import { TasksModule } from '@domain/tasks/tasks.module';
import { ConciergeModule } from '@domain/concierge/concierge.module';
import { AuditModule } from '@domain/audit/audit.module';
import { SchedulingModule } from '@domain/scheduling/scheduling.module';
import { ReportingModule } from '@domain/reporting/reporting.module';
import { WfmModule } from '@domain/wfm/wfm.module';
import { PlannerModule } from '@domain/planner/planner.module';
import { ConfigModule } from '@shared/config/config.module';

/**
 * Bot Module
 * Main module for Discord bot functionality
 */
@Module({
  imports: [
    ConfigModule,
    DiscordModule,
    DatabaseModule,
    ProvisioningModule,
    HrmsModule,
    TasksModule,
    ConciergeModule,
    AuditModule,
    SchedulingModule,
    ReportingModule,
    WfmModule,
    PlannerModule,
  ],
  providers: [BotService],
})
export class BotModule {}
