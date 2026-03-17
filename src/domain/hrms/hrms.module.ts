import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { LeaveService } from './leave.service';
import { DatabaseModule } from '@infra/database/database.module';
import { DiscordModule } from '@infra/discord/discord.module';

/**
 * HRMS Module
 * Provides attendance and leave management services
 */
@Module({
  imports: [DatabaseModule, DiscordModule],
  providers: [AttendanceService, LeaveService],
  exports: [AttendanceService, LeaveService],
})
export class HrmsModule {}
