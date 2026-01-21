import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service';

/**
 * Discord Module
 * Provides DiscordService for bot interactions
 */
@Module({
  providers: [DiscordService],
  exports: [DiscordService],
})
export class DiscordModule {}
