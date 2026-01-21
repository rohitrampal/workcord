import { Module } from '@nestjs/common';
import { ConciergeService } from './concierge.service';
import { DatabaseModule } from '@infra/database/database.module';
import { DiscordModule } from '@infra/discord/discord.module';

/**
 * Concierge Module
 * Provides concierge channel and personal stats services
 */
@Module({
  imports: [DatabaseModule, DiscordModule],
  providers: [ConciergeService],
  exports: [ConciergeService],
})
export class ConciergeModule {}
