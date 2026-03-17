/**
 * Concierge Commands Tests
 */

import { ConciergeCommands } from '@bot/commands/concierge.commands';
import { ConciergeService } from '@domain/concierge/concierge.service';
import { HrTicketService } from '@domain/concierge/hr-ticket.service';
import { KnowledgeBaseService } from '@domain/concierge/knowledge-base.service';
import { DiscordService } from '@infra/discord/discord.service';
import { PrismaService } from '@infra/database/prisma.service';
import { AuditService } from '@domain/audit/audit.service';
import { ChatInputCommandInteraction } from 'discord.js';

describe('ConciergeCommands', () => {
  let commands: ConciergeCommands;
  let mockConciergeService: jest.Mocked<ConciergeService>;
  let mockHrTicketService: jest.Mocked<HrTicketService>;
  let mockKnowledgeBaseService: jest.Mocked<KnowledgeBaseService>;
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockConciergeService = {
      getPersonalStats: jest.fn(),
    } as any;

    mockHrTicketService = {
      createTicket: jest.fn(),
    } as any;

    mockKnowledgeBaseService = {
      searchArticles: jest.fn(),
      browseByCategory: jest.fn(),
      getArticle: jest.fn(),
      submitFeedback: jest.fn(),
    } as any;

    commands = new ConciergeCommands(
      mockConciergeService,
      mockHrTicketService,
      mockKnowledgeBaseService,
      {} as any,
      {} as any,
      {} as any,
    );

    mockInteraction = {
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      guildId: 'test-guild',
      user: { id: 'test-user' },
      options: {
        getSubcommand: jest.fn(),
        getString: jest.fn(),
        getBoolean: jest.fn(),
      },
    } as any;
  });

  describe('getCommands', () => {
    it('should return mystats, hrhelp, and knowledgebase commands', () => {
      const commandsList = ConciergeCommands.getCommands();

      expect(commandsList.length).toBe(3);
      expect(commandsList[0].name).toBe('mystats');
      expect(commandsList[1].name).toBe('hrhelp');
      expect(commandsList[2].name).toBe('knowledgebase');
    });
  });
});
