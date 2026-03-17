import { Module } from '@nestjs/common';
import { ConciergeService } from './concierge.service';
import { HrTicketService } from './hr-ticket.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { DatabaseModule } from '@infra/database/database.module';
import { DiscordModule } from '@infra/discord/discord.module';

/**
 * Concierge Module
 * Provides concierge channel, personal stats, HR tickets, and knowledge base services
 */
@Module({
  imports: [DatabaseModule, DiscordModule],
  providers: [ConciergeService, HrTicketService, KnowledgeBaseService],
  exports: [ConciergeService, HrTicketService, KnowledgeBaseService],
})
export class ConciergeModule {}
